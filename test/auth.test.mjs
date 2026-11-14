import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../server.mjs', import.meta.url));

async function startServer(password) {
  const port = 19000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PARSEC_ADMIN_PORT: String(port), PARSEC_ADMIN_PASSWORD: password, PARSEC_ADMIN_COOKIE_SECURE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk);
  child.stderr.on('data', chunk => output += chunk);
  const base = 'http://127.0.0.1:' + port;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Server exited: ' + output);
    try {
      const response = await fetch(base + '/api/auth/status');
      if (response.ok) return { child, base };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error('Server did not start: ' + output);
}

test('optional password gate protects APIs and issues revocable sessions', async t => {
  const protectedServer = await startServer('correct horse battery staple');
  t.after(() => protectedServer.child.kill());
  const { base } = protectedServer;

  const pageResponse = await fetch(base + '/');
  assert.match(await pageResponse.text(), /loginForm/);

  let response = await fetch(base + '/api/auth/status');
  assert.deepEqual(await response.json(), { passwordRequired: true, authenticated: false });

  response = await fetch(base + '/api/overview');
  assert.equal(response.status, 401);

  response = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'wrong' })
  });
  assert.equal(response.status, 401);

  response = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'correct horse battery staple' })
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Secure/);
  const cookie = setCookie.split(';')[0];
  assert.match(cookie, /^parsec_admin_session=/);

  response = await fetch(base + '/api/overview', { headers: { cookie } });
  assert.equal(response.status, 503, 'authenticated request reaches the upstream credential check');

  response = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie } });
  assert.equal(response.status, 200);
  response = await fetch(base + '/api/overview', { headers: { cookie } });
  assert.equal(response.status, 401, 'logout revokes the session immediately');

  const localServer = await startServer('');
  t.after(() => localServer.child.kill());
  response = await fetch(localServer.base + '/api/auth/status');
  assert.deepEqual(await response.json(), { passwordRequired: false, authenticated: true });
  response = await fetch(localServer.base + '/api/overview');
  assert.equal(response.status, 503, 'empty password leaves the API accessible without a login');
});



