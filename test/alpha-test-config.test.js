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
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /cap_drop:/);
  assert.match(compose, /no-new-privileges:true/);
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
  assert.match(workflow, /"\$\{compose\[@\]\}" restart urbanflow-alpha-test/);
  assert.match(workflow, /after restart/i);
});

test('private playtest kit defines invite-only access, independent origin, rollback, and three measurable scenarios', async () => {
  const kit = await read('ALPHA-1.4.0-PRIVATE-PLAYTEST-KIT.md');
  for (const phrase of [
    'tunel SSH', '127.0.0.1:3101', 'nie otwieraj go w firewallu', 'originu testowego',
    'Scenariusz A', 'Scenariusz B', 'Scenariusz C', 'Przewidywany czas',
    'Kryteria sukcesu', 'Pytania po sesji', 'Miejsce na uwagi',
    'JSON', 'niczego nie wysyła', 'rollback', 'schema 11'
  ]) assert.ok(kit.toLocaleLowerCase('pl-PL').includes(phrase.toLocaleLowerCase('pl-PL')), `missing playtest contract: ${phrase}`);
  assert.match(kit, /severity|ważność/i);
  assert.match(kit, /częstotliwość/i);
});

test('playtest readiness report records validation limits without claiming a local Docker run unless performed', async () => {
  const report = await read('ALPHA-1.4.0-PRIVATE-PLAYTEST-READINESS.md');
  for (const phrase of ['GO', 'NO GO', '360×800', 'Playwright', 'audit:production', 'GitHub Actions', 'Raspberry Pi', 'zaproszonych']) {
    assert.ok(report.toLocaleLowerCase('pl-PL').includes(phrase.toLocaleLowerCase('pl-PL')), `missing readiness evidence: ${phrase}`);
  }
});
