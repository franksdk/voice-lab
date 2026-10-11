type Env = Record<string, string | undefined>;
const models = ['qwen-audio-3.0-realtime-flash', 'qwen-audio-3.0-realtime-plus', 'qwen3.5-omni-flash-realtime', 'qwen3.5-omni-plus-realtime'];
export function publicConfig(env: Env) {
  const model = env.DASHSCOPE_MODEL || models[0];
  const region = env.DASHSCOPE_REGION || 'cn-beijing';
  return {
    ready: Boolean(env.DASHSCOPE_API_KEY?.trim() && /^[a-zA-Z0-9-]+$/.test(env.DASHSCOPE_WORKSPACE_ID || '') && models.includes(model) && ['cn-beijing', 'ap-southeast-1'].includes(region)),
    requiresCode: Boolean(env.DEMO_ACCESS_CODE), model, region,
  };
}
const errorResponse = (message: string, status: number) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
export async function handleSession(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.headers.get('origin') !== new URL(request.url).origin) return errorResponse('请从本站打开体验页面。', 403);
  const config = publicConfig(env);
  if (!config.ready) return errorResponse('语音服务尚未配置。请由管理员设置百炼 API Key 和业务空间 ID。', 503);
  if (env.DEMO_ACCESS_CODE && request.headers.get('x-demo-code') !== env.DEMO_ACCESS_CODE) return errorResponse('体验码不正确，请向管理员确认。', 401);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return errorResponse('请求格式不正确。', 415);
  // Limit streamed request bodies, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return errorResponse('缺少连接信息。', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); return errorResponse('连接信息过大。', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let sdp: unknown;
  try { sdp = JSON.parse(new TextDecoder().decode(bytes)).sdp; } catch { return errorResponse('连接信息无法解析。', 400); }
  if (typeof sdp !== 'string' || !sdp.startsWith('v=0') || !sdp.includes('m=audio')) return errorResponse('浏览器未提供有效的音频连接信息。', 400);
  const url = `https://${env.DASHSCOPE_WORKSPACE_ID}.${config.region}.maas.aliyuncs.com/api/v1/webrtc/realtime?model=${config.model}`;
  try {
    const upstream = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, 'Content-Type': 'application/sdp' }, body: sdp, signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]) });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      const message = upstream.status === 401 || upstream.status === 403 ? '百炼拒绝了连接，请检查密钥、业务空间和模型权限。' : upstream.status === 429 ? '模型额度或并发已达上限，请稍后重试并检查余额。' : '语音服务暂时无法连接，请稍后重试。';
      return errorResponse(message, 502);
    }
    const answer = await upstream.text();
    if (!answer.startsWith('v=0') || !answer.includes('m=audio')) return errorResponse('语音服务返回了无效的连接信息。', 502);
    return new Response(answer, { headers: { 'Content-Type': 'application/sdp', 'Cache-Control': 'no-store' } });
  } catch { return errorResponse('连接超时或网络不可达，请检查服务器到百炼的网络。', 504); }
}
