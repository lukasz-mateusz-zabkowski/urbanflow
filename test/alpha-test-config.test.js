import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('alpha test compose is isolated, loopback-only and pins version metadata to an explicit SHA', async () => {
  const [compose, dockerfile, docs] = await Promise.all([
    read('compose.alpha-test.yml'), read('Dockerfile'), read('ALPHA-1.4.0-PLAYTEST.md')
  ]);
  assert.match(compose, /127\.0\.0\.1:3101:3000/);
  assert.match(compose, /URBANFLOW_ALPHA_TEST:\s*"1"/);
  assert.match(compose, /URBANFLOW_COMMIT_SHA:\s*\$\{URBANFLOW_COMMIT_SHA:\?/);
  assert.doesNotMatch(compose, /volumes:/);
  assert.match(dockerfile, /h\.version===version/);
  assert.match(dockerfile, /h\.commit===expected/);
  assert.match(docs, /local storage/i);
  assert.match(docs, /invite-only access control/i);
});

test('container-health CI starts and stops the isolated alpha compose profile', async () => {
  const workflow = await read('.github/workflows/test.yml');
  assert.match(workflow, /Run isolated alpha Compose profile/);
  assert.match(workflow, /compose=\(docker compose -p "\$COMPOSE_PROJECT_NAME" -f compose\.alpha-test\.yml\)/);
  assert.match(workflow, /"\$\{compose\[@\]\}" up --build --detach/);
  assert.match(workflow, /"\$\{compose\[@\]\}" port urbanflow-alpha-test 3000/);
  assert.match(workflow, /"\$\{compose\[@\]\}" stop urbanflow-alpha-test/);
});
