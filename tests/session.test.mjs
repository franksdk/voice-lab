import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSession, publicConfig } from '../lib/session.ts';

const env = { DASHSCOPE_API_KEY: 'private-test-key', DASHSCOPE_WORKSPACE_ID: 'workspace123', DEMO_ACCESS_CODE: 'demo-test-code' };
const request = (body = { sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }, origin = 'https://demo.example', code = 'demo-test-code') => new Request('https://demo.example/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Demo-Code': code }, body: JSON.stringify(body) });
test('public configuration reports missing setup without exposing secrets', () => {
  assert.equal(publicConfig({}).ready, false);
  assert.equal(publicConfig(env).ready, true);
  assert.equal(JSON.stringify(publicConfig(env)).includes('private-test-key'), false);
});
test('missing credentials never call the paid provider', async () => {
  let called = false;
  const result = await handleSession(request(), {}, async () => { called = true; return new Response(''); });
  assert.equal(result.status, 503);
  assert.equal(called, false);
});
test('cross-origin requests and incorrect access codes are rejected', async () => {
  const noNetwork = async () => { throw new Error('should not call provider'); };
  assert.equal((await handleSession(request(undefined, 'https://evil.example'), env, noNetwork)).status, 403);
  assert.equal((await handleSession(request(undefined, undefined, 'wrong'), env, noNetwork)).status, 401);
});
test('bad and oversized SDP are rejected before billing', async () => {
  const noNetwork = async () => { throw new Error('should not call provider'); };
  assert.equal((await handleSession(request({ sdp: 'not SDP' }), env, noNetwork)).status, 400);
  assert.equal((await handleSession(request({ sdp: 'v=0\r\nm=audio ' + 'x'.repeat(70000) }), env, noNetwork)).status, 413);
});
test('server forwards SDP to the fixed Aliyun endpoint using server-only credentials', async () => {
  const result = await handleSession(request(), env, async (url, init) => {
    assert.equal(new URL(url).hostname, 'workspace123.cn-beijing.maas.aliyuncs.com');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer private-test-key');
    assert.equal(new Headers(init.headers).get('Content-Type'), 'application/sdp');
    return new Response('v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n');
  });
  assert.equal(result.status, 200);
  assert.match(await result.text(), /^v=0/);
});
test('upstream errors and unexpected responses never leak provider bodies', async () => {
  const result = await handleSession(request(), env, async () => new Response('private-test-key internal-details', { status: 401 }));
  assert.equal(result.status, 502);
  assert.equal((await result.text()).includes('private-test-key'), false);
  assert.equal((await handleSession(request(), env, async () => new Response('<html>bad gateway</html>'))).status, 502);
});
