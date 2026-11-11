import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('the standalone website verifier ships the canonical requirements compiler', async () => {
  for (const file of ['markdown-requirements.mjs', 'fixture-requirements.mjs']) {
    const load = name => readFile(new URL('../packages/' + name + '/checks/' + file, import.meta.url));
    assert.deepEqual(await load('website-acceptance'), await load('requirements'));
  }
});
