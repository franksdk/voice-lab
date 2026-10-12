import { buildDoubaoConfig } from '../selfhost/doubao.mjs';
import { encode, decode } from '../selfhost/doubao-protocol.mjs';
export function connectDoubao(env, onClose = () => {}) {
  const pair = new WebSocketPair(); const [client, browser] = Object.values(pair);
  browser.accept();
  let upstream, ready = false, closing = false, connecting = false, bytes = 0, since = Date.now();
  const sid = crypto.randomUUID();
  const send = data => { if (!closing) browser.send(JSON.stringify(data)); };
  const finish = () => { if (closing) return; closing = true; clearTimeout(timeout); clearTimeout(limit); upstream?.close(); browser.close(); onClose(); };
  const fail = message => { send({ error: message }); finish(); };
  const timeout = setTimeout(() => fail('豆包连接超时，请稍后重试。'), 20000);
  const limit = setTimeout(() => { send({ ended: true }); finish(); }, 300000);
  browser.addEventListener('close', finish); browser.addEventListener('error', finish);
  browser.addEventListener('message', async event => {
    if (closing) return;
    if (typeof event.data !== 'string') {
      const raw = Buffer.from(event.data);
      if (Date.now() - since >= 1000) { bytes = 0; since = Date.now(); }
      bytes += raw.length;
      if (raw.length > 8192 || raw.length % 2 || bytes > 96000) return fail('音频发送过快，请重新连接。');
      if (ready) upstream.send(encode(200, raw, sid));
      return;
    }
    if (connecting) return fail('连接参数重复。');
    connecting = true;
    let input;
    try { if (event.data.length > 8192) throw Error(); input = JSON.parse(event.data); } catch { return fail('连接参数无效。'); }
    if (typeof input.scenario !== 'string' || typeof input.notes !== 'string' || input.notes.length > 1500) return fail('对话设置无效。');
    try {
      const response = await fetch('https://openspeech.bytedance.com/api/v3/realtime/dialogue', { headers: { Upgrade: 'websocket', 'X-Api-App-ID': env.VOLCENGINE_APP_ID, 'X-Api-Access-Key': env.VOLCENGINE_ACCESS_KEY, 'X-Api-Resource-Id': 'volc.speech.dialog', 'X-Api-App-Key': 'PlgvMymc7f3tQnJ6', 'X-Api-Connect-Id': crypto.randomUUID() }, signal: AbortSignal.timeout(12000) });
      if (!response.webSocket) throw Error();
      upstream = response.webSocket; upstream.accept();
      if (closing) { upstream.close(); return; }
      upstream.addEventListener('message', event => {
        try {
          const data = Buffer.from(event.data); if (data.length > 1048576) throw Error();
          const message = decode(data);
          if (closing) return;
          if (message.code || [51,153,599].includes(message.event)) return fail('豆包处理失败，请检查额度、权限或稍后重试。');
          if (message.event === 50) upstream.send(encode(100, buildDoubaoConfig(input), sid));
          if (message.event === 150) { ready = true; clearTimeout(timeout); send({ ready: true }); }
          if (message.event === 352) browser.send(message.payload);
          else if ([450,451,459,550,559,359].includes(message.event)) send({ event: message.event, data: message.data });
        } catch { fail('豆包返回的音频数据无法处理，请重试。'); }
      });
      upstream.addEventListener('error', () => fail('豆包连接失败，请检查语音服务权限与额度。'));
      upstream.addEventListener('close', () => { if (!closing) fail('豆包连接已断开，请重新开始。'); });
      upstream.send(encode(1, {}));
    } catch { fail('豆包连接失败，请检查语音服务权限与额度。'); }
  });
  return new Response(null, { status: 101, webSocket: client });
}
