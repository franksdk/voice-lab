import { attachDoubao } from './doubao.mjs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { handleRequest } from './handler.mjs';

export function serverConfiguration(input) {
  const env = { ...input };
  let origin;
  try { origin = new URL(env.PUBLIC_ORIGIN); } catch { throw new Error('Set PUBLIC_ORIGIN to the browser origin, e.g. http://localhost:8080'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.origin !== env.PUBLIC_ORIGIN || origin.username || origin.password ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local))) {
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin, or HTTP localhost, without a trailing slash');
  }
  env.AUTH_MODE ||= 'basic';
  if (!['basic', 'gateway'].includes(env.AUTH_MODE)) throw new Error('AUTH_MODE must be basic or gateway');
  if (env.AUTH_MODE === 'basic') {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(env.VOICE_USERNAME || '') ||
        (env.VOICE_PASSWORD || '').length < 12 || /[\r\n]/.test(env.VOICE_PASSWORD)) {
      throw new Error('Set VOICE_USERNAME and a VOICE_PASSWORD of at least 12 characters');
    }
    // Internal only: users never need to send or manage this generated secret.
    env.INTERNAL_GATEWAY_TOKEN ||= randomBytes(32).toString('hex');
  } else if (!env.INTERNAL_GATEWAY_TOKEN) {
    throw new Error('Gateway mode requires INTERNAL_GATEWAY_TOKEN and a trusted authenticating reverse proxy');
  }
  env.DATA_DIR = resolve(env.DATA_DIR || resolve(import.meta.dirname, '../data'));
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  return { env, port, host: env.HOST || '127.0.0.1' };
}

const challenge = { 'WWW-Authenticate': 'Basic realm="Voice Lab", charset="UTF-8"' };
const digest = value => createHash('sha256').update(value).digest();

function authentication(env) {
  const expected = env.AUTH_MODE === 'basic' ? digest(`${env.VOICE_USERNAME}:${env.VOICE_PASSWORD}`) : null;
  const attempts = new Map();
  return (incoming, allowSample = false) => {
    if (env.AUTH_MODE === 'gateway') return null;
    // Ignore caller-controlled account headers, including authenticated callers.
    delete incoming.headers['x-voice-gateway'];
    delete incoming.headers['x-voice-user'];
    if (allowSample && incoming.method === 'GET') {
      const pathname = new URL(incoming.url, env.PUBLIC_ORIGIN).pathname;
      if (/^\/voice-lab\/api\/voice-samples\/[a-f0-9]{64}$/.test(pathname)) {
        incoming.headers['x-voice-gateway'] = env.INTERNAL_GATEWAY_TOKEN;
        return null; // Short-lived, random sample URLs must be downloadable by the voice provider.
      }
    }
    const authorization = incoming.headers.authorization || '';
    const match = /^Basic ([a-zA-Z0-9+/]+={0,2})$/i.exec(authorization);
    const credentials = match ? Buffer.from(match[1], 'base64').toString('utf8') : '';
    if (timingSafeEqual(digest(credentials), expected)) {
      incoming.headers['x-voice-gateway'] = env.INTERNAL_GATEWAY_TOKEN;
      incoming.headers['x-voice-user'] = env.VOICE_USERNAME;
      return null;
    }
    // Bound both retry rate and memory without trusting forwarded client addresses.
    const now = Date.now(), key = incoming.socket.remoteAddress || 'unknown';
    const previous = attempts.get(key);
    const attempt = previous && previous.until > now ? previous : { count: 0, until: now + 60_000 };
    attempt.count++;
    if (!attempts.has(key) && attempts.size >= 1024) attempts.delete(attempts.keys().next().value);
    attempts.set(key, attempt);
    return attempt.count > 10
      ? { status: 429, message: 'Too many login attempts', headers: { 'Retry-After': '60' } }
      : { status: 401, message: 'Login required', headers: challenge };
  };
}

export function createVoiceServer(input, { root = resolve(import.meta.dirname, '../dist-selfhost') } = {}) {
  const { env } = serverConfiguration(input);
  const authenticate = authentication(env);
  const server = createServer(async (incoming, outgoing) => {
    outgoing.setHeader('Cache-Control', 'no-store');
    outgoing.setHeader('X-Content-Type-Options', 'nosniff');
    outgoing.setHeader('X-Frame-Options', 'DENY');
    outgoing.setHeader('Referrer-Policy', 'no-referrer');
    outgoing.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
    const controller = new AbortController();
    incoming.once('aborted', () => controller.abort());
    outgoing.once('close', () => { if (!outgoing.writableEnded) controller.abort(); });
    try {
      const denied = authenticate(incoming, true);
      if (denied) { outgoing.writeHead(denied.status, denied.headers).end(denied.message); return; }
      // The origin is operator configuration, never a caller-controlled Host header.
      const url = new URL(incoming.url, env.PUBLIC_ORIGIN);
      if (url.origin !== env.PUBLIC_ORIGIN) { outgoing.writeHead(400).end(); return; }
      const method = incoming.method || 'GET';
      if (!['GET', 'HEAD'].includes(method) && incoming.headers.origin !== env.PUBLIC_ORIGIN) {
        outgoing.writeHead(403).end('Please use the configured site origin'); return;
      }
      if (['/', '/voice-lab'].includes(url.pathname)) { outgoing.writeHead(302, { Location: '/voice-lab/' }).end(); return; }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      }
      const request = new Request(url, { method, headers, signal: controller.signal,
        ...(!['GET', 'HEAD'].includes(method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}) });
      const response = await handleRequest(request, { root, env });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body && method !== 'HEAD') Readable.fromWeb(response.body).pipe(outgoing);
      else outgoing.end();
    } catch {
      console.error('Request failed');
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end('Request failed');
    }
  });
  attachDoubao(server, env, { authorizeUpgrade(incoming, socket) {
    const denied = authenticate(incoming);
    if (!denied) return true;
    const reason = denied.status === 401 ? 'Unauthorized' : 'Too Many Requests';
    const headers = Object.entries(denied.headers).map(([key, value]) => `${key}: ${value}\r\n`).join('');
    socket.end(`HTTP/1.1 ${denied.status} ${reason}\r\n${headers}Connection: close\r\n\r\n`);
    return false;
  } });
  server.requestTimeout = 80000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 40;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = serverConfiguration(process.env);
  const server = createVoiceServer(config.env);
  server.listen(config.port, config.host, () => console.log(`Voice Lab ready: ${config.env.PUBLIC_ORIGIN}/voice-lab/`));
  const stop = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
