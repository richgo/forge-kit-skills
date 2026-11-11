import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyTrace } from './product-requirements.mjs';

const [requirements, acceptance, plan, receipt, artifact, report] = await Promise.all(
  ['product-requirements.md', 'acceptance.json', 'plan.json', 'receipt.json', 'deployed.mjs', 'requirements-verification.json']
    .map(name => readFile(name))
);
assert.deepEqual(JSON.parse(report), verifyTrace(requirements, JSON.parse(plan), JSON.parse(receipt), artifact, acceptance),
  'Requirements verification report does not match the independent check');
