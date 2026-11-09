import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as jev from '../packages/repair-acceptance/checks/jev.mjs';

const answer = (choice, probabilities) => Response.json({
  model: 'jev-1.13.0', answers: { repair: { type: 'choice', choice, probabilities } },
});
const probabilities = { restore: 0.9, 'retry-observation': 0.08, escalate: 0.02 };

test('runtime advisor accepts only typed choices for the approved signal', async () => {
  for (const choice of Object.keys(probabilities)) {
    const scores = { ...probabilities, restore: probabilities[choice], [choice]: 0.9 };
    const result = await jev.requestJevRuntime('token', async (_url, request) => {
      const body = JSON.parse(request.body);
      assert.deepEqual(body.state, { failure: 'confirmed-content-mismatch' });
      assert.deepEqual(Object.keys(body.questions.repair.criteria), Object.keys(probabilities));
      return answer(choice, scores);
    }, { failure: 'confirmed-content-mismatch' });
    assert.deepEqual(result, { choice, probability: 0.9 });
  }
});

test('runtime advisor rejects raw incident data, unknown choices and ambiguous probabilities', async () => {
  assert.equal(await jev.requestJevRuntime('token', () => assert.fail('unapproved outbound data'),
    { failure: 'https://private.example/' }), null);
  for (const response of [
    answer('retry-build', probabilities),
    answer('restore', { restore: 0.49, 'retry-observation': 0.49, escalate: 0.02 }),
  ]) {
    assert.equal(await jev.requestJevRuntime('token', () => response, { failure: 'unconfirmed' }), null);
  }
});
