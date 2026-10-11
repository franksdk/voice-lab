import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { publicConfig, handleSession } from '../lib/session.ts';
import { handleAccountRequest, handleVoiceSampleRequest } from './account.mjs';
import { handlePreview } from './preview.mjs';

const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.md':'text/plain; charset=utf-8' };
const result = (body, status = 200) => new Response(body, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
export async function handleRequest(request, {root, env}) {
  // Nginx authenticates the user's account, then replaces this header with a
  // server-only secret. Loopback callers cannot bypass the account gateway.
  const configured = env.INTERNAL_GATEWAY_TOKEN;
  const supplied = request.headers.get('x-voice-gateway') || '';
  if (!configured || Buffer.byteLength(configured) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(configured), Buffer.from(supplied))) return result('Forbidden', 403);
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/voice-lab/api/voice-samples/')) return handleVoiceSampleRequest(request, env);
  if (pathname === '/voice-lab/api/preview') return handlePreview(request, env);
  if (['/voice-lab/api/account','/voice-lab/api/memory','/voice-lab/api/conversations','/voice-lab/api/voices/clone','/voice-lab/api/voices/sync','/voice-lab/api/voices/delete'].includes(pathname)) return handleAccountRequest(request, env);
  if (pathname === '/voice-lab/api/session' && request.method === 'POST') return handleSession(request, env);
  if (!['GET','HEAD'].includes(request.method)) return result('Method not allowed', 405);
  if (pathname === '/voice-lab/api/config') return Response.json({...publicConfig(env),doubaoReady:Boolean(env.VOLCENGINE_APP_ID && env.VOLCENGINE_ACCESS_KEY)}, {headers:{'Cache-Control':'no-store'}});
  if (!pathname.startsWith('/voice-lab/')) return result('Not found',404);
  let relative;
  try { relative = ['phone', 'phone/'].includes(pathname.slice('/voice-lab/'.length)) ? 'index.html' : decodeURIComponent(pathname.slice('/voice-lab/'.length)) || 'index.html'; } catch { return result('Not found',404); }
  if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').some(part => part.startsWith('.'))) return result('Not found',404);
  const target = resolve(root, relative);
  if (!target.startsWith(resolve(root) + sep) || !types[extname(target)]) return result('Not found',404);
  try {
    const body = await readFile(target);
    return new Response(request.method === 'HEAD' ? null : body, { headers:{ 'Content-Type':types[extname(target)], 'Content-Length':String(body.length), 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' } });
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') console.error('Static file read failed');
    return result('Not found',404);
  }
}
