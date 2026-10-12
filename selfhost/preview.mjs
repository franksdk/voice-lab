import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { aliyunLanguages, aliyunVoices, doubaoLanguages, doubaoVoices } from '../lib/voice-options.ts';
import { buildDoubaoConfig } from './doubao.mjs';
import { encode, decode } from './doubao-protocol.mjs';
import { voicesForUser } from './account.mjs';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
let activePreviews = 0;

export function previewSelection(provider, language, voice, customVoiceIds = []) {
  if (!['aliyun', 'doubao'].includes(provider)) throw new Error('请选择有效的语音模型。');
  const languages = provider === 'aliyun' ? aliyunLanguages : doubaoLanguages;
  const voices = provider === 'aliyun' ? aliyunVoices : doubaoVoices;
  if (!languages.some(item => item.id === language)) throw new Error('当前模型不支持这个语言。');
  const selected = voices.find(item => item.id === voice);
  const custom = provider === 'aliyun' && customVoiceIds.includes(voice);
  if ((!selected && !custom) || (selected?.languages && !selected.languages.includes(language))) throw new Error('当前语言不能使用这个音色。');
  return { provider, language, voice };
}

export function pcmToWav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function collectWebSocket(url, options, start) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    const chunks = [];
    let finished = false;
    const timeout = setTimeout(() => finish(new Error('试听生成超时，请重试。')), 25000);
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (socket.readyState === WebSocket.OPEN) socket.close(); else socket.terminate();
      if (error) reject(error); else resolve(Buffer.concat(chunks));
    };
    socket.on('open', () => start({ socket, chunks, finish }));
    socket.on('error', () => finish(new Error('语音服务连接失败，请稍后重试。')));
    socket.on('close', () => { if (!finished) finish(new Error('语音服务提前断开，请重试。')); });
  });
}

async function aliyunPreview(selection, env) {
  const language = aliyunLanguages.find(item => item.id === selection.language);
  const model = env.DASHSCOPE_MODEL || 'qwen-audio-3.0-realtime-flash';
  const region = env.DASHSCOPE_REGION || 'cn-beijing';
  const url = `wss://${env.DASHSCOPE_WORKSPACE_ID}.${region}.maas.aliyuncs.com/api-ws/v1/realtime?model=${model}`;
  return collectWebSocket(url, { headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}` }, handshakeTimeout: 12000, maxPayload: 2_000_000, perMessageDeflate: false }, ({ socket, chunks, finish }) => {
    socket.on('message', raw => {
      let event;
      try { event = JSON.parse(raw.toString()); } catch { return finish(new Error('百炼返回了无效数据。')); }
      if (event.type === 'session.created') socket.send(JSON.stringify({ type: 'session.update', event_id: randomUUID(), session: { modalities: ['text', 'audio'], voice: selection.voice, instructions: `全程使用${language.instruction}。只说一句自然、简短的问候，用于试听当前音色。`, turn_detection: null } }));
      if (event.type === 'session.updated') {
        socket.send(JSON.stringify({ type: 'conversation.item.create', event_id: randomUUID(), item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '请问候我。' }] } }));
        socket.send(JSON.stringify({ type: 'response.create', event_id: randomUUID() }));
      }
      if (event.type === 'response.audio.delta' && event.delta) chunks.push(Buffer.from(event.delta, 'base64'));
      if (event.type === 'error') finish(new Error('百炼暂时无法生成这个试听。'));
      if (event.type === 'response.done') finish(chunks.length ? null : new Error('百炼没有返回试听音频。'));
    });
  });
}

async function doubaoPreview(selection, env) {
  const session = randomUUID();
  const config = buildDoubaoConfig({ scenario: 'software', notes: '只说一句自然、简短的问候，用于试听当前音色。', ...selection });
  config.dialog.extra.input_mod = 'text';
  return collectWebSocket('wss://openspeech.bytedance.com/api/v3/realtime/dialogue', { headers: { 'X-Api-App-ID': env.VOLCENGINE_APP_ID, 'X-Api-Access-Key': env.VOLCENGINE_ACCESS_KEY, 'X-Api-Resource-Id': 'volc.speech.dialog', 'X-Api-App-Key': 'PlgvMymc7f3tQnJ6', 'X-Api-Connect-Id': randomUUID() }, handshakeTimeout: 12000, maxPayload: 2_000_000, perMessageDeflate: false }, ({ socket, chunks, finish }) => {
    socket.send(encode(1, {}));
    socket.on('message', raw => {
      let event;
      try { event = decode(raw); } catch { return finish(new Error('豆包返回了无效数据。')); }
      if (event.event === 50) socket.send(encode(100, config, session));
      if (event.event === 150) socket.send(encode(501, { content: '请问候我。' }, session));
      if (event.event === 352) {
        if (Buffer.concat(chunks).length + event.payload.length > 1_500_000) return finish(new Error('试听音频过长。'));
        chunks.push(event.payload);
      }
      if ([51, 153, 599].includes(event.event) || event.code) finish(new Error('豆包暂时无法生成这个试听。'));
      if (event.event === 359) {
        socket.send(encode(102, {}, session));
        finish(chunks.length ? null : new Error('豆包没有返回试听音频。'));
      }
    });
  });
}

export async function handlePreview(request, env) {
  let acquired = false;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('origin') !== env.PUBLIC_ORIGIN) return json({ error: '请从本站发起试听。' }, 403);
  const user = (request.headers.get('x-voice-user') || '').trim();
  if (!user) return json({ error: '请重新登录。' }, 401);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: '请求格式不正确。' }, 415);
  if (Number(request.headers.get('content-length') || 0) > 2048) return json({ error: '请求内容过大。' }, 413);
  let input;
  try { input = await request.json(); } catch { return json({ error: '请求格式不正确。' }, 400); }
  if (activePreviews >= 2) return json({ error: '正在试听的人较多，请稍后再试。' }, 429);
  try {
    const custom = (await voicesForUser(env.STORAGE || env.DATA_DIR || '/data', user)).filter(item => item.provider === 'aliyun' && item.status !== 'UNDEPLOYED').map(item => item.id);
    const selection = previewSelection(input.provider, input.language, input.voice, custom);
    if (selection.provider === 'aliyun' && (!env.DASHSCOPE_API_KEY || !env.DASHSCOPE_WORKSPACE_ID)) return json({ error: '百炼服务尚未配置。' }, 503);
    if (selection.provider === 'doubao' && (!env.VOLCENGINE_APP_ID || !env.VOLCENGINE_ACCESS_KEY)) return json({ error: '豆包服务尚未配置。' }, 503);
    activePreviews++; acquired = true;
    const pcm = selection.provider === 'aliyun' ? await aliyunPreview(selection, env) : await doubaoPreview(selection, env);
    const wav = pcmToWav(pcm);
    return new Response(wav, { headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(wav.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '试听失败，请稍后重试。';
    const invalid = /请选择|不支持|不能使用/.test(message);
    if (!invalid) console.error('Preview failed');
    return json({ error: message }, invalid ? 400 : 502);
  } finally { if (acquired) activePreviews--; }
}
