import express from 'express';
import { readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commitShaPattern = /^[a-f0-9]{7,40}$/i;

export function createApp({ commitSha = process.env.URBANFLOW_COMMIT_SHA } = {}) {
  const app = express();
  const health = { status: 'ok', app: 'UrbanFlow', version };
  if (typeof commitSha === 'string' && commitShaPattern.test(commitSha)) {
    health.commit = commitSha;
  }

  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json(health));
  // The routing graph is stored gzip-compressed on disk. Mark it as an HTTP
  // content encoding so Fetch transparently decompresses it in the browser.
  app.get(/^\/data\/routing\/krakow-(road|tram)-graph\.bin\.gz$/, (req, res, next) => {
    const mode = req.path.includes('-road-') ? 'road' : 'tram';
    const filename = path.join(root, 'public', 'data', 'routing', `krakow-${mode}-graph.bin.gz`);
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Encoding', 'gzip');
    res.vary('Accept-Encoding');
    res.sendFile(path.basename(filename), { root: path.dirname(filename) }, error => { if (error) next(error); });
  });
  app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules', 'leaflet', 'dist'), {
    etag: true,
    maxAge: '30d'
  }));
  app.use(express.static(path.join(root, 'public'), {
    etag: true,
    // Revalidate module files as well as HTML so a rollout never mixes game schemas.
    maxAge: 0
  }));
  app.get('*path', (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  createApp().listen(port, host, () => {
    console.log(`UrbanFlow działa na http://${host}:${port}`);
  });
}
