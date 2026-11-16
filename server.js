import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const root = path.dirname(fileURLToPath(import.meta.url));

app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'UrbanFlow', version: '0.6.0' }));
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

app.listen(port, host, () => {
  console.log(`UrbanFlow działa na http://${host}:${port}`);
});
