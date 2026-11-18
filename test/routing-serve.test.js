import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

test('compressed OSM graph is served as gzip content and transparently decoded by Fetch', async t => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/data/routing/krakow-road-graph.bin.gz`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  assert.match(response.headers.get('content-type'), /application\/octet-stream/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [85, 70, 71, 49]); // UFG1 after Fetch decompression
  assert.ok(bytes.byteLength > 20_000_000);
});
