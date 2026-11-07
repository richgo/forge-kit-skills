import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function checkRepair(failure, before, after, evidence) {
  const { path, beforeStatus, beforeBody, afterStatus, afterBody } = failure;
  assert.match(path, /^\/[a-z][a-z0-9/-]*$/);
  for (const status of [beforeStatus, afterStatus]) {
    assert.ok(Number.isInteger(status) && status >= 200 && status < 600 && ![204, 205, 304].includes(status),
      'Expected an HTTP status with a response body');
  }
  for (const body of [beforeBody, afterBody]) {
    assert.ok(typeof body === 'string' && Buffer.byteLength(body) <= 1024, 'Invalid HTTP response body');
  }
  assert.notDeepEqual([beforeStatus, beforeBody], [afterStatus, afterBody], 'Failure must differ from acceptance');
  assert.deepEqual(evidence, { path, beforeStatus, beforeBody, afterStatus, afterBody }, 'Plan must replay the reported failure');
  assert.deepEqual(before, { path, status: beforeStatus, body: beforeBody }, 'Failure was not reproduced on the original candidate');
  assert.deepEqual(after, { path, status: afterStatus, body: afterBody }, 'Repair did not satisfy the same request');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const data = await Promise.all(['failure.json', 'before.json', 'candidate.json', 'repair-evidence.json']
    .map(async name => JSON.parse(await readFile(name))));
  checkRepair(...data);
}
