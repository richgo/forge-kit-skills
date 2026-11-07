import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function createEnvironment(root) {
  const pointer = join(root, 'active');
  const lock = join(root, '.promotion-lock');

  async function current() {
    try {
      const state = JSON.parse(await readFile(pointer, 'utf8'));
      assert.match(state.id, /^[a-f0-9]{64}$/);
      assert.match(state.generation, /^[a-f0-9-]{36}$/);
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function locked(action) {
    await mkdir(root, { recursive: true });
    await mkdir(lock);
    try {
      return await action();
    } finally {
      await rmdir(lock);
    }
  }

  async function artifact(id) {
    assert.match(id, /^[a-f0-9]{64}$/);
    const bytes = await readFile(join(root, id + '.json'));
    assert.equal(hash(bytes), id, 'Deployment bytes changed');
    return bytes;
  }

  async function activate(id) {
    if (id === null) {
      await rm(pointer, { force: true });
      return;
    }
    const tmp = join(root, '.active-' + randomUUID());
    try {
      const state = { id, generation: randomUUID() };
      await writeFile(tmp, JSON.stringify(state), { flag: 'wx' });
      await rename(tmp, pointer);
      return state;
    } finally {
      await rm(tmp, { force: true });
    }
  }

  return {
    async active() {
      return (await current())?.id ?? null;
    },
    async promote(bytes, verified) {
      const snapshot = Buffer.from(bytes);
      assert.equal(await verified(Buffer.from(snapshot)), true, 'Only independently verified artifacts can be promoted');
      const id = hash(snapshot);
      return locked(async () => {
        const previous = (await current())?.id ?? null;
        try {
          await writeFile(join(root, id + '.json'), snapshot, { flag: 'wx' });
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          await artifact(id);
        }
        return { ...await activate(id), previous };
      });
    },
    async rollback({ id, generation, previous }) {
      await locked(async () => {
        assert.deepEqual(await current(), { id, generation }, 'Active deployment changed before rollback');
        if (previous !== null) await artifact(previous);
        await activate(previous);
      });
    },
    async observe(path = '/ready') {
      assert.match(path, /^\/[a-z][a-z0-9/-]*$/);
      const deployment = await current();
      assert.ok(deployment, 'No active deployment');
      const { id } = deployment;
      const response = JSON.parse(await artifact(id));
      const server = createServer((req, res) => {
        if (req.method === 'GET' && req.url === response.path) {
          res.writeHead(response.status, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(response.body);
        } else {
          res.writeHead(404).end();
        }
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      try {
        const observed = await fetch(new URL(path, 'http://127.0.0.1:' + server.address().port), {
          redirect: 'error', signal: AbortSignal.timeout(3000),
        });
        const result = { id, status: observed.status, body: await observed.text() };
        assert.deepEqual(await current(), deployment, 'Active deployment changed during observation');
        return result;
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    },
  };
}
