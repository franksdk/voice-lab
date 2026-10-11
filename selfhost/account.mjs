import { mkdir, readFile, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { join } from 'node:path';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const initial = () => ({ memory: '', conversations: [], voices: [] });
const userOf = request => (request.headers.get('x-voice-user') || '').trim();
const fileOf = (dataDir, user) => join(dataDir, `${createHash('sha256').update(user).digest('hex')}.json`);
const endpointOf = env => `https://${env.DASHSCOPE_WORKSPACE_ID}.${env.DASHSCOPE_REGION || 'cn-beijing'}.maas.aliyuncs.com/api/v1/services/audio/tts/customization`;
const providerHeaders = env => ({ Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' });

export async function handleVoiceSampleRequest(request, env) {
  const token = new URL(request.url).pathname.split('/').at(-1) || '';
  if (request.method !== 'GET' || !/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Not found' }, 404);
  const sampleDir = join(env.DATA_DIR || '/data', 'voice-samples');
  for (const [extension, contentType] of [['wav','audio/wav'],['mpeg','audio/mpeg'],['mp4','audio/mp4']]) {
    const path = join(sampleDir, `${token}.${extension}`);
    try {
      const info = await stat(path);
      if (Date.now() - info.mtimeMs > 15 * 60 * 1000) { await unlink(path).catch(() => {}); continue; }
      const bytes = await readFile(path);
      return new Response(bytes, { headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return json({ error: 'Not found' }, 404);
}

async function load(dataDir, user) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  try { return { ...initial(), ...JSON.parse(await readFile(fileOf(dataDir, user), 'utf8')) }; }
  catch (error) { if (error.code === 'ENOENT') return initial(); throw error; }
}

export async function voicesForUser(dataDir, user) {
  return (await load(dataDir, user)).voices;
}

async function save(dataDir, user, account) {
  const target = fileOf(dataDir, user);
  const pending = `${target}.${randomUUID()}.tmp`;
  await writeFile(pending, `${JSON.stringify(account)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(pending, target);
}

async function body(request, maxBytes) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > maxBytes) throw Object.assign(new Error('Too large'), { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw Object.assign(new Error('Too large'), { status: 413 });
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function contextOf(account) {
  const recent = account.conversations.slice(-3).flatMap(item => item.messages).slice(-30)
    .map(message => `${message.role === 'user' ? '客户' : '顾问'}：${message.text}`).join('\n');
  return [`长期记忆：${account.memory || '暂无'}`, recent ? `近期对话：\n${recent}` : ''].filter(Boolean).join('\n');
}

export async function handleAccountRequest(request, env, fetcher = fetch) {
  const user = userOf(request);
  if (!user || user.length > 128) return json({ error: '请重新登录。' }, 401);
  const dataDir = env.DATA_DIR || '/data';
  const pathname = new URL(request.url).pathname;
  try {
    const account = await load(dataDir, user);
    if (pathname.endsWith('/api/account') && request.method === 'GET') return json({
      user, memory: account.memory, context: contextOf(account), voices: account.voices,
      recentConversationCount: account.conversations.length,
    });
    if (pathname.endsWith('/api/memory') && request.method === 'PUT') {
      const input = await body(request, 9000);
      if (typeof input.memory !== 'string' || input.memory.length > 8000) return json({ error: '记忆内容最多 8000 字。' }, 413);
      account.memory = input.memory.trim();
      await save(dataDir, user, account);
      return json({ saved: true });
    }
    if (pathname.endsWith('/api/conversations') && request.method === 'POST') {
      const input = await body(request, 24000);
      if (!Array.isArray(input.messages)) return json({ error: '对话记录无效。' }, 400);
      const messages = input.messages.slice(-40).map(message => ({
        role: message?.role === 'assistant' ? 'assistant' : 'user',
        text: typeof message?.text === 'string' ? message.text.trim().slice(0, 1000) : '',
      })).filter(message => message.text);
      if (!messages.length) return json({ error: '没有可保存的对话。' }, 400);
      account.conversations.push({ at: new Date().toISOString(), messages });
      account.conversations = account.conversations.slice(-10);
      await save(dataDir, user, account);
      return json({ saved: true });
    }
    if (pathname.endsWith('/api/voices/clone') && request.method === 'POST') {
      const input = await body(request, 7_000_000);
      const match = /^data:audio\/(wav|mpeg|mp4);base64,([A-Za-z0-9+/=]+)$/.exec(input.audioData || '');
      if (input.provider !== 'aliyun' || input.consent !== true || typeof input.name !== 'string' || !input.name.trim() || !match) {
        return json({ error: '请填写名称，并确认已获得声音授权。' }, 400);
      }
      if (!env.DASHSCOPE_API_KEY || !env.DASHSCOPE_WORKSPACE_ID) return json({ error: '百炼服务尚未配置。' }, 503);
      const sample = Buffer.from(match[2], 'base64');
      if (!sample.length || sample.length > 5_000_000) return json({ error: '录音文件不能超过 5MB。' }, 413);
      const token = randomBytes(32).toString('hex');
      const sampleDir = join(dataDir, 'voice-samples');
      await mkdir(sampleDir, { recursive: true, mode: 0o700 });
      const samplePath = join(sampleDir, `${token}.${match[1]}`);
      await writeFile(samplePath, sample, { mode: 0o600 });
      setTimeout(() => unlink(samplePath).catch(() => {}), 10 * 60 * 1000).unref();
      const prefix = `u${createHash('sha256').update(user + input.name).digest('hex').slice(0, 9)}`;
      const sampleUrl = `${env.PUBLIC_ORIGIN || 'https://gptimg2.you'}/voice-lab/api/voice-samples/${token}`;
      let upstream;
      try {
        upstream = await fetcher(endpointOf(env), {
          method: 'POST', signal: AbortSignal.timeout(60000),
          headers: providerHeaders(env),
          body: JSON.stringify({ model: 'voice-enrollment', input: { action: 'create_voice', target_model: env.DASHSCOPE_MODEL || 'qwen-audio-3.0-realtime-flash', prefix, url: sampleUrl } }),
        });
      } finally { await unlink(samplePath).catch(() => {}); }
      const response = await upstream.json().catch(() => ({}));
      if (!upstream.ok || typeof response?.output?.voice_id !== 'string') return json({ error: upstream.status === 401 || upstream.status === 403 ? '百炼拒绝创建音色，请检查复刻权限。' : '音色创建失败，请检查录音格式后重试。' }, 502);
      const voice = { provider: 'aliyun', id: response.output.voice_id, name: input.name.trim().slice(0, 30) };
      account.voices = [...account.voices.filter(item => item.id !== voice.id), voice].slice(-20);
      await save(dataDir, user, account);
      return json({ voice }, 201);
    }
    if (pathname.endsWith('/api/voices/sync') && request.method === 'POST') {
      if (!env.DASHSCOPE_API_KEY || !env.DASHSCOPE_WORKSPACE_ID) return json({ error: '百炼服务尚未配置。' }, 503);
      const checked = [];
      for (const voice of account.voices) {
        if (voice.provider !== 'aliyun') { checked.push(voice); continue; }
        const upstream = await fetcher(endpointOf(env), { method: 'POST', signal: AbortSignal.timeout(15000), headers: providerHeaders(env), body: JSON.stringify({ model: 'voice-enrollment', input: { action: 'query_voice', voice_id: voice.id } }) });
        const response = await upstream.json().catch(() => ({}));
        if (upstream.status === 404 || (upstream.ok && response?.output?.status === 'UNDEPLOYED')) continue;
        checked.push({ ...voice, status: upstream.ok ? response?.output?.status || 'UNKNOWN' : voice.status || 'UNKNOWN' });
      }
      account.voices = checked;
      await save(dataDir, user, account);
      return json({ voices: account.voices });
    }
    if (pathname.endsWith('/api/voices/delete') && request.method === 'POST') {
      const input = await body(request, 2000);
      const voice = account.voices.find(item => item.provider === 'aliyun' && item.id === input.voiceId);
      if (!voice) return json({ error: '没有找到这个账号的音色。' }, 404);
      if (!env.DASHSCOPE_API_KEY || !env.DASHSCOPE_WORKSPACE_ID) return json({ error: '百炼服务尚未配置。' }, 503);
      const upstream = await fetcher(endpointOf(env), { method: 'POST', signal: AbortSignal.timeout(15000), headers: providerHeaders(env), body: JSON.stringify({ model: 'voice-enrollment', input: { action: 'delete_voice', voice_id: voice.id } }) });
      if (!upstream.ok && upstream.status !== 404) return json({ error: '删除音色失败，请稍后重试。' }, 502);
      account.voices = account.voices.filter(item => item.id !== voice.id);
      await save(dataDir, user, account);
      return json({ deleted: true });
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    if (error?.status) return json({ error: error.message }, error.status);
    console.error('Account request failed');
    return json({ error: '服务暂时不可用。' }, 500);
  }
}
