import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyCheckoutSha } from '../scripts/alpha-playtest.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function tempRepository(t) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'urbanflow-alpha-sha-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '--quiet');
  git(cwd, '-c', 'user.name=Playtest Test', '-c', 'user.email=playtest@example.invalid', 'config', 'core.autocrlf', 'false');
  await writeFile(path.join(cwd, 'server.js'), 'export const version = 1;\n');
  git(cwd, 'add', 'server.js');
  git(cwd, '-c', 'user.name=Playtest Test', '-c', 'user.email=playtest@example.invalid', 'commit', '--quiet', '-m', 'first');
  const previousSha = git(cwd, 'rev-parse', 'HEAD');
  await writeFile(path.join(cwd, 'server.js'), 'export const version = 2;\n');
  git(cwd, 'add', 'server.js');
  git(cwd, '-c', 'user.name=Playtest Test', '-c', 'user.email=playtest@example.invalid', 'commit', '--quiet', '-m', 'second');
  return { cwd, previousSha, currentSha: git(cwd, 'rev-parse', 'HEAD') };
}

test('playtest source guard accepts only the clean checkout matching the configured SHA', async t => {
  const { cwd, previousSha, currentSha } = await tempRepository(t);
  await writeFile(path.join(cwd, '.env.alpha-test'), `URBANFLOW_COMMIT_SHA=${currentSha}\n`);

  assert.equal(verifyCheckoutSha({ cwd, expectedSha: currentSha }), currentSha);
  assert.throws(() => verifyCheckoutSha({ cwd, expectedSha: previousSha }), /checkout SHA .* does not match configured SHA/i);
  await writeFile(path.join(cwd, 'unexpected.txt'), 'untracked build input\n');
  assert.throws(() => verifyCheckoutSha({ cwd, expectedSha: currentSha }), /other untracked files exist/i);
  await unlink(path.join(cwd, 'unexpected.txt'));
  await writeFile(path.join(cwd, 'server.js'), 'export const version = 3;\n');
  assert.throws(() => verifyCheckoutSha({ cwd, expectedSha: currentSha }), /tracked source files are modified/i);
});

test('playtest source guard rejects malformed or missing SHA values', async t => {
  const { cwd, currentSha } = await tempRepository(t);
  assert.throws(() => verifyCheckoutSha({ cwd, expectedSha: 'not-a-sha' }), /40-character commit SHA/i);
  assert.throws(() => verifyCheckoutSha({ cwd, expectedSha: undefined }), /40-character commit SHA/i);
  assert.equal((await readFile(path.join(cwd, 'server.js'), 'utf8')).includes('version = 2'), true);
});
