import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { validateArchitecture } from '../../architecture/checks/architecture.mjs';
import { checkCandidate, signReceipt, verifyReceipt } from '../../acceptance/checks/acceptance.mjs';

export function build(requirements) {
  const [{ path, status, body }] = JSON.parse(requirements);
  return Buffer.from(JSON.stringify({ path, status, body }) + '\n');
}

export function repairDecision(signal, used, limit) {
  const retry = signal?.probabilities?.retry;
  const escalate = signal?.probabilities?.escalate;
  if (signal?.choice === 'retry' && Number.isSafeInteger(used) && used >= 0 &&
      Number.isSafeInteger(limit) && used < limit &&
      Number.isFinite(retry) && Number.isFinite(escalate) && retry >= 0.8 &&
      retry <= 1 && escalate >= 0 && Math.abs(retry + escalate - 1) <= 0.001) {
    return 'retry';
  }
  return 'escalate';
}

export async function jevRepair(token) {
  if (!token) return null;
  try {
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'The isolated readiness observation failed and the deployment was rolled back.',
        questions: {
          repair: {
            type: 'choice',
            instructions: 'Recommend one reference rebuild or human escalation.',
            criteria: { retry: 'Rebuild and independently verify once', escalate: 'Escalate to a human' },
          },
        },
      }),
    });
    if (!response.ok) return null;
    const answer = (await response.json())?.answers?.repair;
    return answer?.type === 'choice' ? answer : null;
  } catch {
    return null;
  }
}

export async function runLifecycle(inputs, environment, {
  maxRepairs = 1,
  probe = (env, _, path) => env.observe(path),
  recommend = () => null,
  onStage = () => {},
} = {}) {
  assert.ok(maxRepairs === 0 || maxRepairs === 1);
  const stages = [];
  const record = async stage => {
    stages.push(stage);
    await onStage(stage);
  };
  await record('requirements');
  validateArchitecture(inputs);
  await record('architecture');
  const [{ path, status, body }] = JSON.parse(inputs.requirements);
  const signer = generateKeyPairSync('ed25519');
  await record('plan');

  for (let used = 0; used <= maxRepairs; used++) {
    await record('build');
    const candidate = build(inputs.requirements);
    await record('test');
    const receipt = checkCandidate(candidate, inputs);
    const envelope = signReceipt(receipt, signer.privateKey);
    await record('deploy');
    const promotion = await environment.promote(candidate, bytes => verifyReceipt(envelope, signer.publicKey, bytes, inputs));
    await record('observe');
    let observed;
    try {
      observed = await probe(environment, used, path);
    } catch {
      observed = null;
    }
    if (observed?.id === promotion.id && observed.status === status && observed.body === body) {
      await record('evidence');
      return { stages, receipt, observed };
    }
    await environment.rollback(promotion);
    await record('rollback');
    const signal = used < maxRepairs ? await recommend() : null;
    if (repairDecision(signal, used, maxRepairs) === 'escalate') {
      await record('escalated');
      throw new Error('Readiness failed; deployment rolled back and escalated');
    }
    await record('repair');
  }
}
