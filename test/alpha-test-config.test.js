import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('alpha test compose is isolated, loopback-only and pins version metadata to an explicit SHA', async () => {
  const [compose, dockerfile, docs, kit] = await Promise.all([
    read('compose.alpha-test.yml'), read('Dockerfile'), read('ALPHA-1.4.0-PLAYTEST.md'), read('ALPHA-1.4.0-PRIVATE-PLAYTEST-KIT.md')
  ]);
  assert.match(compose, /127\.0\.0\.1:3101:3000/);
  assert.match(compose, /URBANFLOW_ALPHA_TEST:\s*"1"/);
  assert.match(compose, /URBANFLOW_COMMIT_SHA:\s*\$\{URBANFLOW_COMMIT_SHA:\?/);
  assert.doesNotMatch(compose, /volumes:/);
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /cap_drop:/);
  assert.match(compose, /no-new-privileges:true/);
  assert.doesNotMatch(compose, /internal:\s*true/);
  assert.match(dockerfile, /h\.version===version/);
  assert.match(dockerfile, /h\.commit===expected/);
  assert.match(docs, /hardened instructions/i);
  assert.doesNotMatch(docs, /docker compose .* up --build/i);
  assert.match(kit, /localStorage/i);
  assert.match(kit, /zaproszon/i);
});

test('container-health CI starts and stops the isolated alpha compose profile', async () => {
  const [workflow, script, packageJson] = await Promise.all([
    read('.github/workflows/test.yml'), read('scripts/alpha-playtest.mjs'), read('package.json')
  ]);
  assert.match(packageJson, /"alpha-test":\s*"node scripts\/alpha-playtest\.mjs"/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.match(workflow, /SHA guard accepted a mismatched checkout/);
  for (const action of ['verify', 'start', 'restart', 'status', 'stop', 'rollback']) assert.match(workflow, new RegExp(`alpha-playtest\\.mjs ${action}`));
  assert.match(workflow, /git worktree add --detach/);
  assert.match(workflow, /rollback --cwd/);
  assert.match(script, /rev-parse', '--verify', 'HEAD/);
  assert.match(script, /does not match configured SHA/);
  assert.match(script, /health\.commit !== expectedSha/);
  assert.match(script, /127\.0\.0\.1:3101/);
  assert.match(script, /Mounts\?\.length/);
  assert.match(script, /ReadonlyRootfs/);
  assert.match(script, /CapDrop\?\.includes\('ALL'\)/);
  assert.match(script, /no-new-privileges/);
  assert.match(script, /Tmpfs\?\.\['\/tmp'\]/);
  assert.match(script, /network', 'inspect'/);
  assert.match(script, /standard bridge network so the host can reach its loopback-only published port/i);
  assert.match(script, /lastError\?\.cause\?\.message/);
  assert.match(script, /logs', '--tail=40/);
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
  assert.match(kit, /Windows \+ Docker Desktop/);
  assert.match(kit, /Linux \+ Docker Engine/);
  assert.match(kit, /npm\.cmd run alpha-test -- start/);
  assert.match(kit, /npm run alpha-test -- start/);
  assert.match(kit, /rollback --cwd/);
  assert.match(kit, /<PEŁNY_ZATWIERDZONY_SHA_GAŁĘZI_PLAYTEST>/);
  assert.doesNotMatch(kit, /git checkout --detach 346bcbe9880d8719d4c8cf8a3d8b26a6e89b2491/);
});

test('playtest readiness report records validation limits without claiming a local Docker run unless performed', async () => {
  const report = await read('ALPHA-1.4.0-PRIVATE-PLAYTEST-READINESS.md');
  for (const phrase of ['GO', 'NO GO', '360×800', 'Playwright', 'audit:production', 'GitHub Actions', 'Raspberry Pi', 'testerów']) {
    assert.ok(report.toLocaleLowerCase('pl-PL').includes(phrase.toLocaleLowerCase('pl-PL')), `missing readiness evidence: ${phrase}`);
  }
});
