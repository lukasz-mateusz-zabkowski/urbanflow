import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_PROJECT = process.env.COMPOSE_PROJECT_NAME || 'urbanflow-alpha-test';
const COMPOSE_FILE = 'compose.alpha-test.yml';
const ENV_FILE = '.env.alpha-test';
const HEALTH_URL = 'http://127.0.0.1:3101/health';

function gitOutput(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    throw new Error(`git ${args.join(' ')} failed: ${error.stderr?.toString().trim() || error.message}`);
  }
}

export function verifyCheckoutSha({ cwd = ROOT, expectedSha }) {
  if (typeof expectedSha !== 'string' || !/^[a-f0-9]{40}$/i.test(expectedSha)) {
    throw new Error('URBANFLOW_COMMIT_SHA must be a full 40-character commit SHA.');
  }

  const actualSha = gitOutput(cwd, ['rev-parse', '--verify', 'HEAD']);
  if (actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error(`Checkout SHA ${actualSha} does not match configured SHA ${expectedSha}.`);
  }

  const dirty = gitOutput(cwd, ['status', '--porcelain', '--untracked-files=all'])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(line => !/^\?\? \.env\.alpha-test$/.test(line));
  if (dirty.length) {
    throw new Error(`Playtest build requires a clean checkout; tracked source files are modified or other untracked files exist:\n${dirty.join('\n')}`);
  }
  return actualSha;
}

async function readConfiguredSha(cwd) {
  const contents = await readFile(path.join(cwd, ENV_FILE), 'utf8');
  const match = contents.match(/^\s*URBANFLOW_COMMIT_SHA\s*=\s*['"]?([a-f0-9]{40})['"]?\s*$/im);
  if (!match) throw new Error(`${ENV_FILE} must contain one full 40-character URBANFLOW_COMMIT_SHA.`);
  return match[1];
}

function docker(args, cwd = ROOT, { capture = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
  if (result.error) throw new Error(`Docker command failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`docker ${args.join(' ')} exited with status ${result.status}.`);
  return result.stdout?.trim() ?? '';
}

function compose(args, cwd) {
  return docker(['compose', '--env-file', ENV_FILE, '-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, ...args], cwd, { capture: args[0] === 'port' || args[0] === 'ps' });
}

function assertContainerConfiguration(containerId, expectedSha, cwd) {
  const user = docker(['inspect', '--format={{.Config.User}}', containerId], cwd, { capture: true });
  if (user !== 'node') throw new Error(`Container must run as node, got '${user}'.`);

  const imageRevision = docker(['image', 'inspect', '--format={{ index .Config.Labels "org.opencontainers.image.revision" }}', `urbanflow-alpha-test:${expectedSha}`], cwd, { capture: true });
  if (imageRevision !== expectedSha) throw new Error(`Image revision ${imageRevision} does not match ${expectedSha}.`);

  const inspect = JSON.parse(docker(['inspect', '--format={{json .}}', containerId], cwd, { capture: true }));
  const host = inspect.HostConfig;
  const published = host.PortBindings?.['3000/tcp'] ?? [];
  const boundLocally = published.some(binding => binding.HostIp === '127.0.0.1' && binding.HostPort === '3101');
  if (!boundLocally) throw new Error('Container must publish port 3000 only as 127.0.0.1:3101.');
  if (inspect.Mounts?.length) throw new Error('Alpha playtest container must not mount host or production data.');
  if (!host.ReadonlyRootfs) throw new Error('Alpha playtest container root filesystem must be read-only.');
  if (!host.CapDrop?.includes('ALL')) throw new Error('Alpha playtest container must drop all Linux capabilities.');
  if (!host.SecurityOpt?.some(value => value.includes('no-new-privileges'))) throw new Error('Alpha playtest container must set no-new-privileges.');
  if (host.RestartPolicy?.Name !== 'no') throw new Error('Alpha playtest container must not restart automatically.');
  if (!host.Tmpfs?.['/tmp']) throw new Error('Alpha playtest container must use the configured temporary filesystem for /tmp.');
  const networks = Object.keys(inspect.NetworkSettings?.Networks ?? {});
  if (networks.length !== 1 || docker(['network', 'inspect', '--format={{.Internal}}', networks[0]], cwd, { capture: true }) !== 'true') {
    throw new Error('Alpha playtest must use exactly one Docker internal network with no external egress.');
  }
}

async function checkHealth(expectedSha, cwd) {
  const version = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8')).version;
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      if (!response.ok) throw new Error(`/health returned HTTP ${response.status}.`);
      const health = await response.json();
      if (health.status !== 'ok' || health.version !== version || health.commit !== expectedSha || health.environment !== 'alpha-test') {
        throw new Error(`Unexpected /health: ${JSON.stringify(health)}; expected version ${version}, commit ${expectedSha}, environment alpha-test.`);
      }
      const composePort = compose(['port', 'urbanflow-alpha-test', '3000'], cwd);
      if (!composePort.includes('127.0.0.1:3101')) throw new Error(`Unexpected published port: ${composePort}`);
      const containerId = compose(['ps', '-q', 'urbanflow-alpha-test'], cwd);
      if (!containerId) throw new Error('Compose has no alpha-test container.');
      assertContainerConfiguration(containerId, expectedSha, cwd);
      for (const url of ['http://127.0.0.1:3101/', 'http://127.0.0.1:3101/vendor/leaflet/leaflet.js']) {
        const asset = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!asset.ok) throw new Error(`${url} returned HTTP ${asset.status}.`);
      }
      console.log(`Alpha playtest ready: version=${version}, commit=${expectedSha}, only 127.0.0.1:3101.`);
      return health;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Alpha playtest health check failed: ${lastError?.message ?? 'unknown error'}`);
}

export async function runAlphaPlaytest(action, cwd = ROOT) {
  if (!['verify', 'start', 'restart', 'status', 'stop', 'rollback'].includes(action)) {
    throw new Error('Usage: npm run alpha-test -- <verify|start|restart|status|stop|rollback>');
  }
  const expectedSha = await readConfiguredSha(cwd);
  if (action === 'stop') {
    compose(['down', '--remove-orphans'], cwd);
    console.log('Alpha playtest stopped; no server-side save volume exists.');
    return;
  }
  const actualSha = verifyCheckoutSha({ cwd, expectedSha });
  if (action === 'verify') {
    console.log(`Source verified: HEAD=${actualSha} matches URBANFLOW_COMMIT_SHA.`);
    return;
  }
  if (action === 'status') {
    await checkHealth(actualSha, cwd);
    return;
  }
  if (action === 'restart') {
    compose(['restart', 'urbanflow-alpha-test'], cwd);
  } else {
    if (action === 'rollback') compose(['down', '--remove-orphans'], cwd);
    compose(['up', '--build', '--detach'], cwd);
  }
  await checkHealth(actualSha, cwd);
}

async function main() {
  try {
    await runAlphaPlaytest(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
