import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createApp } from '../server.js';

const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const servers = new Set();

async function requestHealth(commitSha, alphaTestMode = false) {
  const app = createApp({ commitSha, alphaTestMode });
  const server = app.listen(0, '127.0.0.1');
  servers.add(server);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json()
    };
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    servers.delete(server);
  }
}

after(async () => {
  await Promise.all([...servers].map(server => new Promise(resolve => server.close(resolve))));
});

test('health reports the package version without leaking server details', async () => {
  const response = await requestHealth();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: 'ok',
    app: 'UrbanFlow',
    version: packageInfo.version
  });
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('health includes only a valid deployment commit SHA', async () => {
  const validResponse = await requestHealth('230c29ffd0c036f1b2adcc2c55d3ed3dcd847a51');
  assert.deepEqual(validResponse.body, {
    status: 'ok',
    app: 'UrbanFlow',
    version: packageInfo.version,
    commit: '230c29ffd0c036f1b2adcc2c55d3ed3dcd847a51'
  });

  const invalidResponse = await requestHealth('token-do-not-expose');
  assert.deepEqual(invalidResponse.body, {
    status: 'ok',
    app: 'UrbanFlow',
    version: packageInfo.version
  });
});

test('alpha-test server identifies the test environment and sends noindex headers without changing production defaults', async () => {
  const response = await requestHealth('abcdef0123456789', true);
  assert.deepEqual(response.body, {
    status: 'ok', app: 'UrbanFlow', version: packageInfo.version, commit: 'abcdef0123456789', environment: 'alpha-test'
  });
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
});
