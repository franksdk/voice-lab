import {attachDoubao} from './doubao.mjs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { handleRequest } from './handler.mjs';

const origin = process.env.PUBLIC_ORIGIN;
if (!origin || !/^https:\/\/[^/]+$/.test(origin) || !process.env.INTERNAL_GATEWAY_TOKEN) throw new Error('PUBLIC_ORIGIN and INTERNAL_GATEWAY_TOKEN must be configured');
const root = resolve(import.meta.dirname, '../dist-selfhost');
const server = createServer(async (incoming, outgoing) => {
  const controller = new AbortController();
  incoming.once('aborted', () => controller.abort());
  outgoing.once('close', () => { if (!outgoing.writableEnded) controller.abort(); });
  try {
    // The public origin is operator configuration, never a forwarded Host value.
    const url = new URL(incoming.url, origin);
    if (url.origin !== origin) { outgoing.writeHead(400).end(); return; }
    const headers = new Headers();
    for (const [key,value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    }
    const method = incoming.method || 'GET';
    const request = new Request(url, {method, headers, signal:controller.signal, ...(method !== 'GET' && method !== 'HEAD' ? {body:Readable.toWeb(incoming), duplex:'half'} : {})});
    const response = await handleRequest(request, {root, env:process.env});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body && method !== 'HEAD') Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    console.error('Request failed');
    if (!outgoing.headersSent) outgoing.writeHead(500, {'Cache-Control':'no-store'});
    outgoing.end('Request failed');
  }
});
attachDoubao(server,process.env);
server.requestTimeout = 80000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 40;
server.listen(8080, '0.0.0.0', () => console.log('Voice Lab ready on container port 8080'));
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref(); });
