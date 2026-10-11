import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleRequest } from '../selfhost/handler.mjs';
const secret = 'test-gateway-token-not-production';
const options = { root: '', env: { INTERNAL_GATEWAY_TOKEN: secret, PUBLIC_ORIGIN: 'https://demo.example' } };
const req = (path, token = secret, method = 'GET') => new Request('https://demo.example' + path, { method, headers: { 'x-voice-gateway': token } });
test('all backend routes reject absent, incorrect or unconfigured gateway authentication', async () => {
  for (const path of ['/voice-lab/', '/voice-lab/phone/', '/voice-lab/api/config', '/voice-lab/api/session', '/voice-lab/api/preview']) {
    assert.equal((await handleRequest(req(path, ''), options)).status, 403);
    assert.equal((await handleRequest(req(path, 'incorrect'), options)).status, 403);
  }
  assert.equal((await handleRequest(req('/voice-lab/'), { ...options, env: {} })).status, 403);
});

test('account routes require the authenticated username forwarded by the gateway', async () => {
  const response = await handleRequest(req('/voice-lab/api/account'), options);
  assert.equal(response.status, 401);
});
test('authenticated config is not cached and cannot leak server secret', async () => {
  const response = await handleRequest(req('/voice-lab/api/config'), options);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const config = await response.json();
  assert.equal(config.ready, false);
  assert.equal(JSON.stringify(config).includes(secret), false);
});
test('static serving restricts paths and methods, and supports a safe HEAD', async () => {
  const root = await mkdtemp(join(tmpdir(), 'voice-test-'));
  try {
    await writeFile(join(root, 'index.html'), '<h1>Voice</h1>');
    const context = { ...options, root };
    assert.equal(await (await handleRequest(req('/voice-lab/'), context)).text(), '<h1>Voice</h1>');
    assert.equal(await (await handleRequest(req('/voice-lab/phone/'), context)).text(), '<h1>Voice</h1>');
    assert.equal((await handleRequest(req('/voice-lab/phone'), context)).status, 200);
    assert.equal((await handleRequest(req('/voice-lab/unknown-page/'), context)).status, 404);
    assert.equal((await handleRequest(req('/voice-lab/.env'), context)).status, 404);
    assert.equal((await handleRequest(req('/voice-lab/%2e%2e%2f.env'), context)).status, 404);
    assert.equal((await handleRequest(req('/voice-lab/', secret, 'POST'), context)).status, 405);
    const head = await handleRequest(req('/voice-lab/', secret, 'HEAD'), context);
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally { await rm(root, {recursive:true, force:true}); }
});
