import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyTrace } from './product-requirements.mjs';

const [requirements, receipt, artifact, report] = await Promise.all(
  ['product-requirements.json', 'receipt.json', 'deployed.mjs', 'requirements-verification.json']
    .map(name => readFile(name))
);
assert.deepEqual(JSON.parse(report), verifyTrace(requirements, JSON.parse(receipt), artifact),
  'Requirements verification report does not match the independent check');
