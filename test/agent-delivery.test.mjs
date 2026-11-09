import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { produceRevision, readAgentEvents, verifyAgentAudit } from '../packages/agent-delivery/runtime/agent-production.mjs';

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
      return { value: responses[role], trace: { sessionId: randomUUID(), responseSha256: 'a'.repeat(64), toolCalls: 0 } };
    },
    check: (_revision, files) => ({
      passed: files['src/main.mjs'] === 'fixed',
      checks: [{ id: 'AC-1', story: 'STORY-1', passed: files['src/main.mjs'] === 'fixed' }],
    }),
    record: event => audit.push(event),
  };
  return { revision, roles, audit, options };
}

test('invalid Copilot JSON is classified without exposing provider output', () => {
  const marker = 'untrusted-response-marker';
  const output = JSON.stringify({ type: 'assistant.message', data: { content: marker } });
  for (const [text, code] of [[marker, 'ERR_COPILOT_EVENT_JSON'], [output, 'ERR_COPILOT_RESPONSE_JSON']]) {
    assert.throws(() => readAgentEvents(text, randomUUID()), error => {
      assert.equal(error.code, code);
      assert.ok(!String(error.stack).includes(marker));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

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

test('review blockers and sandbox failures cannot be retried by a typed advisor', async () => {
  for (const fail of ['review', 'sandbox']) {
    const { revision, options, roles } = fixture();
    const states = [];
    options.adviseRepair = state => {
      states.push(state);
      return { choice: 'retry-build', probability: 1 };
    };
    if (fail === 'review') {
      const agent = options.agent;
      options.agent = role => {
        const result = agent(role);
        if (role === 'review') result.value = { issues: ['Unsafe contract'] };
        return result;
      };
    } else {
      options.check = () => ({ passed: false, checks: [{ id: 'AC-1', story: 'STORY-1', passed: false, reason: 'execution-failed' }] });
    }
    await assert.rejects(produceRevision(revision, null, options), /repair policy/);
    assert.deepEqual(states, [{ failure: 'unclassified-failure', used: 0, limit: 1 }]);
    assert.ok(!roles.includes('repair'));
  }
});

test('strict audit replay requires an authorized typed decision before the repair session', async () => {
  const records = [];
  const candidates = {};
  for (const name of ['initial', 'next']) {
    const { revision, options } = fixture();
    options.adviseRepair = () => ({ choice: 'retry-build', probability: 1 });
    options.record = event => records.push({ revision: name, ...event });
    candidates[name] = await produceRevision(revision, null, options);
  }
  const jsonl = events => events.map(event => JSON.stringify(event)).join('\n');
  const options = { requireRepairPolicy: true };
  assert.doesNotThrow(() => verifyAgentAudit(jsonl(records), candidates, options));
  const stripped = records.filter(event => event.decision !== 'repair-policy');
  assert.throws(() => verifyAgentAudit(jsonl(stripped), candidates, options), /repair policy/);
  assert.doesNotThrow(() => verifyAgentAudit(jsonl(stripped), candidates));
  const decision = records.find(event => event.decision === 'repair-policy');
  decision.recommendation.probability = 0.79;
  assert.throws(() => verifyAgentAudit(jsonl(records), candidates, options), /repair policy/);
});
