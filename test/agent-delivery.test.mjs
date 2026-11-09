import assert from 'node:assert/strict';
import { test } from 'node:test';
import { produceRevision } from '../packages/agent-delivery/runtime/agent-production.mjs';

function fixture() {
  const revision = { product: { files: ['src/main.mjs'] }, architecture: {} };
  const responses = {
    plan: { plan: 'Implement the reviewed contract' },
    code: { files: { 'src/main.mjs': 'broken' } },
    repair: { files: { 'src/main.mjs': 'fixed' } },
    test: { risks: [] },
    review: { issues: [] },
  };
  const roles = [];
  const audit = [];
  const options = {
    agent: role => {
      roles.push(role);
      return { value: responses[role] };
    },
    check: (_revision, files) => ({
      passed: files['src/main.mjs'] === 'fixed',
      checks: [{ id: 'AC-1', story: 'STORY-1', passed: files['src/main.mjs'] === 'fixed' }],
    }),
    record: event => audit.push(event),
  };
  return { revision, roles, audit, options };
}

test('only a confident typed recommendation can authorize the bounded agent repair', async () => {
  const { revision, options, roles, audit } = fixture();
  let calls = 0;
  options.adviseRepair = state => {
    calls++;
    assert.deepEqual(state, { failure: 'readiness-mismatch', used: 0, limit: 1 });
    return { choice: 'retry-build', probability: 0.95, extra: 'must not enter the audit' };
  };
  assert.equal((await produceRevision(revision, null, options)).repairs, 1);
  assert.equal(calls, 1);
  assert.equal(roles.filter(role => role === 'repair').length, 1);
  assert.deepEqual(audit.find(event => event.decision === 'repair-policy'), {
    decision: 'repair-policy',
    state: { failure: 'readiness-mismatch', used: 0, limit: 1 },
    recommendation: { choice: 'retry-build', probability: 0.95 },
    route: 'retry-build',
  });
});

test('missing, invalid, or unavailable advice fails closed', async () => {
  for (const adviseRepair of [
    () => null,
    () => ({ choice: 'retry-build', probability: 0.79 }),
    () => ({ choice: 'retry-build', probability: Infinity }),
    () => ({ choice: 'deploy', probability: 1 }),
    () => { throw new Error('Provider unavailable'); },
  ]) {
    const { revision, options, roles, audit } = fixture();
    await assert.rejects(produceRevision(revision, null, { ...options, adviseRepair }), /repair policy/);
    assert.ok(!roles.includes('repair'));
    assert.equal(audit.find(event => event.decision === 'repair-policy').route, 'escalate');
  }
});
