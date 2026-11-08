import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';

const source = path => new URL('../' + path, import.meta.url);
const read = path => readFile(source(path), 'utf8');

test('all new package exports name tracked source files', async () => {
  for (const name of ['acceptance', 'architecture', 'delivery', 'factory-workflows', 'repair-acceptance']) {
    const directory = 'packages/' + name + '/';
    assert.match(await read(directory + 'apm.yml'), /^version: "\d+\.\d+\.\d+"$/m);
    const { version, exports } = JSON.parse(await read(directory + 'exports.json'));
    assert.equal(version, 1);
    for (const entry of exports) {
      assert.ok((await stat(source(directory + entry.path))).isFile(), entry.path);
    }
  }
});

test('the callable workflow mirrors package sources and grants no write scopes', async () => {
  for (const name of ['forge-reference.md', 'shared/forge-github-read.md']) {
    assert.equal(await read('.github/workflows/' + name), await read('packages/factory-workflows/workflows/' + name));
  }
  const lock = await read('.github/workflows/forge-reference.lock.yml');
  assert.match(lock, /^  workflow_call:$/m);
  assert.doesNotMatch(lock, /\{\{#runtime-import\s/);
  assert.doesNotMatch(lock, /^\s+[a-z-]+: write\s*$/m);
  const manifest = JSON.parse(lock.split('\n').find(line => line.startsWith('# gh-aw-manifest: ')).slice(18));
  for (const server of manifest.mcp_servers) {
    assert.deepEqual(server.tools, server.name === 'github' ? ['get_file_contents'] : ['noop']);
  }
});

test('standalone APMX build uses the same CALM checker as the architecture package', async () => {
  assert.equal(await read('packages/acceptance/checks/architecture.mjs'),
    await read('packages/architecture/checks/architecture.mjs'));
});

test('the packaged factory orchestrator exports its callable worker and matches the installed sources', async () => {
  const catalog = JSON.parse(await read('packages/factory-workflows/exports.json'));
  for (const name of ['forge-factory.md', 'forge-factory-worker.yml']) {
    assert.ok(catalog.exports.some(entry => entry.path === 'workflows/' + name), name + ' is not exported');
    assert.equal(await read('.github/workflows/' + name), await read('packages/factory-workflows/workflows/' + name));
  }
});
