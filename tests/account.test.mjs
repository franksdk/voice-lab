import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleAccountRequest, handleVoiceSampleRequest } from '../selfhost/account.mjs';

const request = (path, user, method = 'GET', body) => new Request(`https://demo.example${path}`, {
  method,
  headers: { 'x-voice-user': user, 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('account memory is isolated by authenticated username and returned as conversation context', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'voice-account-'));
  try {
    assert.equal((await handleAccountRequest(request('/voice-lab/api/memory', '', 'PUT', { memory: 'secret' }), { DATA_DIR: dataDir })).status, 401);
    assert.equal((await handleAccountRequest(request('/voice-lab/api/memory', 'mentor', 'PUT', { memory: '预算两万元，偏好电话联系' }), { DATA_DIR: dataDir })).status, 200);
    const mentor = await (await handleAccountRequest(request('/voice-lab/api/account', 'mentor'), { DATA_DIR: dataDir })).json();
    const other = await (await handleAccountRequest(request('/voice-lab/api/account', 'other'), { DATA_DIR: dataDir })).json();
    assert.equal(mentor.memory, '预算两万元，偏好电话联系');
    assert.match(mentor.context, /预算两万元/);
    assert.equal(other.memory, '');
    assert.doesNotMatch(other.context, /预算两万元/);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('recent conversations persist per account with bounded content', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'voice-account-'));
  try {
    const response = await handleAccountRequest(request('/voice-lab/api/conversations', 'mentor', 'POST', { messages: [
      { role: 'user', text: '我们有十个人' }, { role: 'assistant', text: '主要困难是什么？' },
    ] }), { DATA_DIR: dataDir });
    assert.equal(response.status, 200);
    const account = await (await handleAccountRequest(request('/voice-lab/api/account', 'mentor'), { DATA_DIR: dataDir })).json();
    assert.match(account.context, /我们有十个人/);
    assert.equal(account.recentConversationCount, 1);
    const oversized = await handleAccountRequest(request('/voice-lab/api/memory', 'mentor', 'PUT', { memory: 'x'.repeat(8001) }), { DATA_DIR: dataDir });
    assert.equal(oversized.status, 413);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('voice clone validates consent then stores provider voice id without exposing credentials', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'voice-account-'));
  const env = { DATA_DIR: dataDir, PUBLIC_ORIGIN: 'https://demo.example', DASHSCOPE_API_KEY: 'server-secret', DASHSCOPE_WORKSPACE_ID: 'ws-test', DASHSCOPE_REGION: 'cn-beijing', DASHSCOPE_MODEL: 'qwen-audio-3.0-realtime-flash' };
  try {
    const noConsent = await handleAccountRequest(request('/voice-lab/api/voices/clone', 'mentor', 'POST', { provider: 'aliyun', name: '顾问', text: '你好', audioData: 'data:audio/wav;base64,UklGRg==' }), env, async () => assert.fail('provider should not be called'));
    assert.equal(noConsent.status, 400);
    const created = await handleAccountRequest(request('/voice-lab/api/voices/clone', 'mentor', 'POST', { provider: 'aliyun', name: '顾问A', text: '你好', consent: true, audioData: 'data:audio/wav;base64,UklGRg==' }), env, async (_url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer server-secret');
      const payload = JSON.parse(init.body);
      assert.equal(payload.input.target_model, 'qwen-audio-3.0-realtime-flash');
      assert.ok(payload.input.prefix.length <= 10);
      assert.match(payload.input.url, /^https:\/\/demo\.example\/voice-lab\/api\/voice-samples\/[a-f0-9]{64}$/);
      const sample = await handleVoiceSampleRequest(new Request(payload.input.url), env);
      assert.equal(sample.status, 200);
      assert.deepEqual([...new Uint8Array(await sample.arrayBuffer())], [...Buffer.from('RIFF')]);
      return Response.json({ output: { voice_id: 'qwen-audio-3.0-realtime-flash-mentor-123' } });
    });
    assert.equal(created.status, 201);
    const account = await (await handleAccountRequest(request('/voice-lab/api/account', 'mentor'), env)).json();
    assert.deepEqual(account.voices, [{ provider: 'aliyun', id: 'qwen-audio-3.0-realtime-flash-mentor-123', name: '顾问A' }]);
    assert.equal(JSON.stringify(account).includes('server-secret'), false);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('account can verify and delete a saved cloned voice against the provider', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'voice-account-'));
  const env = { DATA_DIR: dataDir, PUBLIC_ORIGIN: 'https://demo.example', DASHSCOPE_API_KEY: 'server-secret', DASHSCOPE_WORKSPACE_ID: 'ws-test', DASHSCOPE_REGION: 'cn-beijing', DASHSCOPE_MODEL: 'qwen-audio-3.0-realtime-flash' };
  try {
    await handleAccountRequest(request('/voice-lab/api/voices/clone', 'mentor', 'POST', { provider: 'aliyun', name: '顾问A', text: '你好', consent: true, audioData: 'data:audio/wav;base64,UklGRg==' }), env, async () => Response.json({ output: { voice_id: 'qwen-audio-3.0-realtime-flash-mentor-123' } }));
    const synced = await handleAccountRequest(request('/voice-lab/api/voices/sync', 'mentor', 'POST', {}), env, async (_url, init) => {
      assert.equal(JSON.parse(init.body).input.action, 'query_voice');
      return Response.json({ output: { status: 'OK' } });
    });
    assert.equal(synced.status, 200);
    assert.equal((await synced.json()).voices[0].status, 'OK');
    const deleted = await handleAccountRequest(request('/voice-lab/api/voices/delete', 'mentor', 'POST', { voiceId: 'qwen-audio-3.0-realtime-flash-mentor-123' }), env, async (_url, init) => {
      assert.equal(JSON.parse(init.body).input.action, 'delete_voice');
      return Response.json({ output: {} });
    });
    assert.equal(deleted.status, 200);
    const account = await (await handleAccountRequest(request('/voice-lab/api/account', 'mentor'), env)).json();
    assert.deepEqual(account.voices, []);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
