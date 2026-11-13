import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, csvRow } from '../lib/csv.ts';

test('plain values pass through; null is empty', () => {
  assert.equal(csvCell('jane@example.com'), 'jane@example.com');
  assert.equal(csvCell(42), '42');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('commas, quotes and newlines are quoted', () => {
  assert.equal(csvCell('Doe, Jane'), '"Doe, Jane"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('a\nb'), '"a\nb"');
});

test('formula-looking values are defused', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('\tx'), "'\tx");
  assert.equal(csvCell('\rx'), `"'\rx"`);
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.equal(csvCell('a=b'), 'a=b', 'only a leading character counts');
});

test('rows join cells with commas', () => {
  assert.equal(csvRow(['a', 'b,c', '=x']), `a,"b,c",'=x`);
});
