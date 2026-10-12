import { DurableObject } from 'cloudflare:workers';
import { createHash, timingSafeEqual } from 'node:crypto';
import { publicConfig, handleSession } from '../lib/session.ts';
import { handleAccountRequest, handleVoiceSampleRequest } from '../selfhost/account.mjs';
import { handlePreview } from '../selfhost/preview.mjs';
import { connectDoubao } from './doubao.mjs';
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const attempts = new Map();
const digest = value => createHash('sha256').update(value).digest();
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((env.VOICE_PASSWORD || '').length < 12) return json({ error: 'Deployment needs VOICE_PASSWORD. Set a password of at least 12 characters.' }, 503);
    const sample = request.method === 'GET' && /^\/voice-lab\/api\/voice-samples\/[a-f0-9]{64}$/.test(url.pathname);
    if (!sample) {
      const encoded = /^Basic ([a-zA-Z0-9+/]+={0,2})$/i.exec(request.headers.get('authorization') || '');
      const value = encoded ? Buffer.from(encoded[1], 'base64').toString('utf8') : '';
      if (!timingSafeEqual(digest(value), digest(`${env.VOICE_USERNAME || 'admin'}:${env.VOICE_PASSWORD}`))) {
        const key = request.headers.get('cf-connecting-ip') || 'local', now = Date.now();
        const previous = attempts.get(key); const attempt = previous && previous.until > now ? previous : {count: 0, until: now + 60000};
        attempt.count++; if (!attempts.has(key) && attempts.size >= 1024) attempts.delete(attempts.keys().next().value); attempts.set(key, attempt);
        return new Response('Login required', { status: attempt.count > 10 ? 429 : 401, headers: { 'WWW-Authenticate': 'Basic realm="Voice Lab", charset="UTF-8"', 'Cache-Control': 'no-store', 'Retry-After': '60' } });
      }
    }
    if ((!['GET','HEAD'].includes(request.method) || request.headers.get('upgrade')?.toLowerCase() === 'websocket') && request.headers.get('origin') !== url.origin) return json({ error: 'Please use the configured site origin' }, 403);
    if (url.pathname === '/' || url.pathname === '/voice-lab') return Response.redirect(url.origin + '/voice-lab/', 302);
    if (url.pathname.startsWith('/voice-lab/api/')) {
      const headers = new Headers(request.headers); headers.set('x-voice-user', env.VOICE_USERNAME || 'admin');
      const forwarded = new Request(request, { headers });
      return env.VOICE_STATE.get(env.VOICE_STATE.idFromName('voice-lab')).fetch(forwarded);
    }
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    if (url.pathname === '/voice-lab/phone' || url.pathname === '/voice-lab/phone/') url.pathname = '/voice-lab/index.html';
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store'); headers.set('X-Content-Type-Options', 'nosniff'); headers.set('X-Frame-Options', 'DENY'); headers.set('Referrer-Policy', 'no-referrer'); headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
    return new Response(response.body, { status: response.status, headers });
  }
};
export class VoiceState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.storage = ctx.storage; this.tail = Promise.resolve(); this.calls = 0;
    this.adapter = {
      getAccount: async user => {
        const count = await this.storage.get(`account:${user}:count`);
        if (!count) return undefined;
        const chunks = await Promise.all(Array.from({length: count}, (_, i) => this.storage.get(`account:${user}:${i}`)));
        return JSON.parse(chunks.join(''));
      },
      putAccount: async (user, account) => {
        const text = JSON.stringify(account), count = Math.ceil(text.length / 16000);
        await this.storage.transaction(async tx => {
          const previous = await tx.get(`account:${user}:count`) || 0;
          for (let i = 0; i < count; i++) await tx.put(`account:${user}:${i}`, text.slice(i*16000,(i+1)*16000));
          for (let i = count; i < previous; i++) await tx.delete(`account:${user}:${i}`);
          await tx.put(`account:${user}:count`, count);
        });
      },
      putSample: async (token, bytes, format) => {
        const count = Math.ceil(bytes.length / 64000);
        for (let i = 0; i < count; i++) await this.storage.put(`sample:${token}:${i}`, bytes.slice(i*64000,(i+1)*64000));
        await this.storage.put(`sample:${token}`, { count, format, at: Date.now() });
        await this.storage.setAlarm(Date.now() + 15*60*1000);
      },
      deleteSample: async token => {
        const meta = await this.storage.get(`sample:${token}`);
        if (meta) await this.storage.delete([`sample:${token}`, ...Array.from({ length: meta.count }, (_, i) => `sample:${token}:${i}`)]);
      },
      sampleResponse: async token => {
        const meta = await this.storage.get(`sample:${token}`);
        if (!meta || Date.now() - meta.at > 15*60*1000) return json({ error: 'Not found' }, 404);
        const chunks = await Promise.all(Array.from({ length: meta.count }, (_, i) => this.storage.get(`sample:${token}:${i}`)));
        if (chunks.some(chunk => !chunk)) return json({ error: 'Not found' }, 404);
        const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
        return new Response(bytes, { headers: { 'Content-Type': `audio/${meta.format}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
    };
  }
  async alarm() {
    const items = await this.storage.list({ prefix: 'sample:' }); let pending = false;
    for (const [key, value] of items) if (key.split(':').length === 2) {
      if (Date.now() - value.at >= 15*60*1000) await this.adapter.deleteSample(key.slice(7)); else pending = true;
    }
    if (pending) await this.storage.setAlarm(Date.now() + 15*60*1000);
  }
  async fetch(request) {
    const url = new URL(request.url); const env = { ...this.env, PUBLIC_ORIGIN: url.origin, STORAGE: this.adapter };
    if (url.pathname.includes('/api/voice-samples/')) return handleVoiceSampleRequest(request, env);
    if (url.pathname.endsWith('/api/config') && request.method === 'GET') return json({ ...publicConfig(env), doubaoReady: Boolean(env.VOLCENGINE_APP_ID && env.VOLCENGINE_ACCESS_KEY) });
    if (url.pathname.endsWith('/api/session') && request.method === 'POST') return handleSession(request, env);
    if (url.pathname.endsWith('/api/doubao')) {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required' }, 426);
      if (!env.VOLCENGINE_APP_ID || !env.VOLCENGINE_ACCESS_KEY || this.calls >= 4) return json({ error: 'Doubao unavailable' }, 503);
      this.calls++; return connectDoubao(env, () => { this.calls--; });
    }
    if (url.pathname.endsWith('/api/preview')) return handlePreview(request, env);
    // Serialize account changes so simultaneous writes cannot lose memory or voices.
    const task = this.tail.then(() => handleAccountRequest(request, env));
    this.tail = task.catch(() => {}); return task;
  }
}
