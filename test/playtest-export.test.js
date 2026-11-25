import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadJsonFile } from '../public/js/ui.js';

function fakeDocument() {
  const body = { append() {}, };
  const link = { click() { this.clicked = true; }, remove() { this.removed = true; } };
  return { body, link, createElement: () => link };
}

test('JSON download creates a local link and reports success without sending data', () => {
  const documentObject = fakeDocument();
  const revoked = [];
  const urlApi = { createObjectURL: blob => { assert.equal(blob.type, 'application/json'); return 'blob:local-test'; }, revokeObjectURL: url => revoked.push(url) };
  const result = downloadJsonFile({ reportType: 'test' }, 'report.json', { documentObject, urlApi, BlobClass: Blob });
  assert.deepEqual(result, { ok: true });
  assert.equal(documentObject.link.download, 'report.json');
  assert.equal(documentObject.link.clicked, true);
  assert.deepEqual(revoked, []);
});

test('JSON download failure is returned to the UI instead of escaping as an exception', () => {
  const result = downloadJsonFile('{}', 'save.json', {
    documentObject: fakeDocument(), urlApi: { createObjectURL() { throw new Error('blocked'); }, revokeObjectURL() {} }, BlobClass: Blob
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /Skopiuj widoczny JSON/);
});
