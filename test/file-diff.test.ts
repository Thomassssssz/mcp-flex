import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentHash, unifiedDiff } from '../src/file-diff.js';

test('diff exacto de comentario insertado conserva el contenido original', () => {
  const current = '<script>\n\tinit();\n</script>\n';
  const proposed = '<!-- temporal -->\n' + current;
  assert.equal(unifiedDiff('modulos/demo/templates/ver_grid.html', current, proposed),
    '--- a/modulos/demo/templates/ver_grid.html\n+++ b/modulos/demo/templates/ver_grid.html\n@@ -1,3 +1,4 @@\n+<!-- temporal -->\n <script>\n \tinit();\n </script>\n');
  assert.equal(unifiedDiff('file', current, current), '');
});

test('diff incluye cambios distantes completos sin truncamiento', () => {
  const current = Array.from({ length: 1000 }, (_, i) => `line ${i}\n`).join('');
  const proposed = current.replace('line 0\n', 'first\n').replace('line 999\n', 'last\n');
  const diff = unifiedDiff('file', current, proposed);
  assert(diff.includes('@@ -1,1000 +1,1000 @@'));
  assert(diff.includes('-line 999\n'));
  assert(diff.includes('+last\n'));
  assert(diff.includes('-line 500\n'));
});

test('distingue vacío, newline final, CRLF, Unicode y hashes', () => {
  assert.equal(unifiedDiff('file', '', 'x'), '--- a/file\n+++ b/file\n@@ -0,0 +1,1 @@\n+x\n\\ No newline at end of file\n');
  assert.equal(unifiedDiff('file', 'x\n', ''), '--- a/file\n+++ b/file\n@@ -1,1 +0,0 @@\n-x\n');
  const diff = unifiedDiff('file', 'á\r\n', 'á\n');
  assert(diff.includes('-á\r\n+á\n'));
  assert.notEqual(contentHash('á\r\n'), contentHash('á\n'));
  assert.equal(contentHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.throws(() => unifiedDiff('path\nspoofed-header', '', 'x'));
});
