import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
const playtestModule = new URL('../scripts/alpha-playtest.mjs', import.meta.url).href;

test('a stalled health request reports a timeout instead of exiting with unsettled top-level await', () => {
  const childScript = `
    import { withReferencedTimeout } from ${JSON.stringify(playtestModule)};
    let timedOut = false;
    try {
      await withReferencedTimeout(() => new Promise(() => {}), 30, 'health request', () => { timedOut = true; });
      process.exitCode = 1;
    } catch (error) {
      if (!timedOut || !/health request timed out after 30 ms/.test(error.message)) process.exitCode = 2;
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', childScript], {
    encoding: 'utf8',
    timeout: 2000
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stderr, /unsettled top-level await/i);
});
