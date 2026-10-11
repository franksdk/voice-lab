import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { createVoiceServer, serverConfiguration } from '../selfhost/server.mjs';
import { handleAccountRequest } from '../selfhost/account.mjs';

const origin = 'http://localhost:8080';
const username = 'test-user';
const password = 'synthetic-test-password';
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const defaults = { PUBLIC_ORIGIN: origin, VOICE_USERNAME: username, VOICE_PASSWORD: password };
const stop = async server => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'voice-standalone-'));
  await writeFile(join(root, 'index.html'), '<h1>Voice Lab fixture</h1>');
  const env = { ...defaults, DATA_DIR: join(root, 'data') };
  const state = { root, env };
  state.start = async () => {
    state.server = createVoiceServer(env, { root });
    await new Promise(resolve => state.server.listen(0, '127.0.0.1', resolve));
    state.url = `http://127.0.0.1:${state.server.address().port}`;
  };
  await state.start();
  t.after(async () => { await stop(state.server); await rm(root, { recursive: true, force: true }); });
  return state;
}

test('standalone validates login and safe browser origins before listening', () => {
  assert.throws(() => serverConfiguration({ PUBLIC_ORIGIN: origin }), /VOICE_USERNAME/);
  assert.throws(() => serverConfiguration({ ...defaults, PUBLIC_ORIGIN: 'http://public.example' }), /HTTPS/);
  assert.throws(() => serverConfiguration({ ...defaults, PUBLIC_ORIGIN: origin + '/' }), /trailing slash/);
  assert.throws(() => serverConfiguration({ ...defaults, AUTH_MODE: 'gateway' }), /INTERNAL_GATEWAY_TOKEN/);
  assert.throws(() => serverConfiguration({ ...defaults, AUTH_MODE: 'invalid' }), /AUTH_MODE/);
  assert.throws(() => serverConfiguration({ ...defaults, PORT: 'invalid' }), /PORT/);
  assert.equal(serverConfiguration(defaults).host, '127.0.0.1');
});

test('standalone authenticates pages and account routes without a reverse proxy, rejecting forged headers', async t => {
  const f = await fixture(t);
  const anonymous = await fetch(f.url + '/voice-lab/');
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('www-authenticate'), /Basic/);
  const forged = await fetch(f.url + '/voice-lab/api/account', { headers: { 'x-voice-gateway': 'forged', 'x-voice-user': 'victim' } });
  assert.equal(forged.status, 401);
  const page = await fetch(f.url + '/voice-lab/', { headers: { authorization } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Voice Lab fixture/);
  for (const path of ['/', '/voice-lab']) {
    const redirect = await fetch(f.url + path, { headers: { authorization }, redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/voice-lab/');
  }
  const account = await fetch(f.url + '/voice-lab/api/account', { headers: { authorization, 'x-voice-user': 'victim' } });
  assert.equal(account.status, 200);
  assert.equal((await account.json()).user, username);
  const config = await (await fetch(f.url + '/voice-lab/api/config', { headers: { authorization } })).json();
  assert.equal(config.ready, false);
  assert.equal(config.doubaoReady, false);
  assert.equal(JSON.stringify(config).includes(password), false);
});

test('standalone memory survives a service restart and cross-origin writes are rejected', async t => {
  const f = await fixture(t);
  const write = headers => fetch(f.url + '/voice-lab/api/memory', {
    method: 'PUT', headers: { authorization, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ memory: '示例用户偏好中文' }),
  });
  assert.equal((await write({ Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await write({ Origin: origin })).status, 200);
  await stop(f.server);
  await f.start();
  const account = await (await fetch(f.url + '/voice-lab/api/account', { headers: { authorization } })).json();
  assert.equal(account.memory, '示例用户偏好中文');
  assert.match(account.context, /示例用户偏好中文/);
});

test('only short-lived random voice sample URLs bypass login for provider downloads', async t => {
  const f = await fixture(t);
  const token = 'a'.repeat(64);
  await mkdir(join(f.env.DATA_DIR, 'voice-samples'), { recursive: true });
  await writeFile(join(f.env.DATA_DIR, 'voice-samples', token + '.wav'), 'RIFF');
  const sample = await fetch(f.url + '/voice-lab/api/voice-samples/' + token);
  assert.equal(sample.status, 200);
  assert.equal(await sample.text(), 'RIFF');
  assert.equal((await fetch(f.url + '/voice-lab/api/voice-samples/not-a-token')).status, 401);
  assert.equal((await fetch(f.url + '/voice-lab/api/memory?token=' + token)).status, 401);
});

test('standalone websocket uses the same login and origin checks before contacting Doubao', async t => {
  const f = await fixture(t);
  for (const [headers, expected] of [
    [{ Origin: origin }, 401],
    [{ Origin: 'https://foreign.example', Authorization: authorization }, 403],
    [{ Origin: origin, Authorization: authorization }, 503],
  ]) {
    const status = await new Promise((resolve, reject) => {
      const ws = new WebSocket(f.url.replace('http:', 'ws:') + '/voice-lab/api/doubao', { headers });
      ws.on('unexpected-response', (_, response) => { response.resume(); ws.terminate(); resolve(response.statusCode); });
      ws.on('error', () => {});
      ws.on('open', () => { ws.close(); reject(new Error('Unexpected provider connection')); });
    });
    assert.equal(status, expected);
  }
});

test('failed-login rate limiting does not lock out the valid account', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 11; i++) {
    const response = await fetch(f.url + '/voice-lab/api/config');
    assert.equal(response.status, i < 10 ? 401 : 429);
    await response.text();
  }
  assert.equal((await fetch(f.url + '/voice-lab/api/account', { headers: { authorization } })).status, 200);
});

test('malformed websocket request targets cannot crash the standalone server', async t => {
  const f = await fixture(t);
  const response = await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: f.server.address().port });
    let result = '';
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error('Upgrade rejection timed out')); }, 3000);
    socket.on('connect', () => socket.write([
      'GET //[ HTTP/1.1', 'Host: localhost', 'Connection: Upgrade', 'Upgrade: websocket',
      `Authorization: ${authorization}`, `Origin: ${origin}`, 'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', '', '',
    ].join('\r\n')));
    socket.on('data', bytes => { result += bytes.toString(); });
    socket.on('end', () => { clearTimeout(timeout); socket.destroy(); resolve(result); });
    socket.on('error', error => { clearTimeout(timeout); reject(error); });
  });
  assert.match(response, /^HTTP\/1\.1 403/);
  assert.equal((await fetch(f.url + '/voice-lab/api/account', { headers: { authorization } })).status, 200);
});

test('local voice cloning explains its public HTTPS requirement without calling a paid provider', async t => {
  const root = await mkdtemp(join(tmpdir(), 'voice-clone-local-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const request = new Request(origin + '/voice-lab/api/voices/clone', {
    method: 'POST', headers: { 'x-voice-user': username },
    body: JSON.stringify({ provider: 'aliyun', name: '示例音色', consent: true, audioData: 'data:audio/wav;base64,UklGRg==' }),
  });
  const response = await handleAccountRequest(request, { ...defaults, DATA_DIR: root,
    DASHSCOPE_API_KEY: 'synthetic-test-key', DASHSCOPE_WORKSPACE_ID: 'ws-test' }, () => assert.fail('must not contact provider'));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /公网 HTTPS/);
});

test('a fresh CLI process reads .env and starts account APIs with no injected application environment', async t => {
  const root = await mkdtemp(join(tmpdir(), 'voice-env-start-'));
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  await writeFile(join(root, '.env'), [
    `PUBLIC_ORIGIN=http://localhost:${port}`, `PORT=${port}`, `VOICE_USERNAME=${username}`,
    `VOICE_PASSWORD=${password}`, 'DATA_DIR=./data',
  ].join('\n'));
  const env = Object.fromEntries(['SystemRoot', 'PATH', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const child = spawn(process.execPath, ['--env-file=.env', fileURLToPath(new URL('../selfhost/server.mjs', import.meta.url))], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CLI startup timed out')), 10000);
    child.on('error', reject);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`CLI exited before startup: ${code}`)); });
    child.stdout.on('data', bytes => { if (bytes.toString().includes('Voice Lab ready:')) { clearTimeout(timeout); resolve(); } });
    child.stderr.resume();
  });
  const response = await fetch(`http://127.0.0.1:${port}/voice-lab/api/account`, { headers: { authorization } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user, username);
});
