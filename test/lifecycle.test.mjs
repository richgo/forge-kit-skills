import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { project, validateArchitecture } from '../packages/architecture/checks/architecture.mjs';
import { checkCandidate, signReceipt, verifyReceipt } from '../packages/acceptance/checks/acceptance.mjs';
import { checkRepair } from '../packages/repair-acceptance/checks/repair-evidence.mjs';
import { createEnvironment } from '../packages/delivery/runtime/delivery.mjs';
import { build, repairDecision, runLifecycle } from '../packages/factory-workflows/runtime/lifecycle.mjs';

const fixture = name => new URL('../examples/reference/' + name, import.meta.url);
const requirements = await readFile(fixture('requirements.json'));
const architecture = await readFile(fixture('architecture.json'));
const view = await readFile(fixture('architecture.c4'));
const inputs = { requirements, architecture, view };

test('CALM controls the view and every requirement traces to a CALM node', () => {
  assert.equal(project(JSON.parse(architecture)), view.toString());
  assert.doesNotThrow(() => validateArchitecture(inputs));
  assert.throws(() => validateArchitecture({ ...inputs, view: Buffer.from('drift') }), /LikeC4/);
  const bad = JSON.parse(requirements);
  bad[0].node = 'missing';
  assert.throws(() => validateArchitecture({ ...inputs, requirements: Buffer.from(JSON.stringify(bad)) }), /target/);
});

test('independent acceptance binds the exact candidate and inputs to a trusted signer', () => {
  const signer = generateKeyPairSync('ed25519');
  const other = generateKeyPairSync('ed25519');
  const artifact = build(requirements);
  const receipt = checkCandidate(artifact, inputs);
  const envelope = signReceipt(receipt, signer.privateKey);
  assert.equal(verifyReceipt(envelope, signer.publicKey, artifact, inputs), true);
  assert.throws(() => verifyReceipt(envelope, other.publicKey, artifact, inputs), /signature/);
  assert.throws(() => verifyReceipt(envelope, signer.publicKey, Buffer.concat([artifact, Buffer.from(' ')]), inputs), /receipt/);
  const changed = JSON.parse(requirements);
  changed[0].status = 500;
  assert.throws(() => checkCandidate(artifact, { ...inputs, requirements: Buffer.from(JSON.stringify(changed)) }), /acceptance/);
});

test('policy escalates malformed, unknown, low-confidence and exhausted signals', () => {
  const retry = { choice: 'retry', probabilities: { retry: 0.95, escalate: 0.05 } };
  assert.equal(repairDecision(retry, 0, 1), 'retry');
  assert.equal(repairDecision(retry, 1, 1), 'escalate');
  assert.equal(repairDecision({ ...retry, choice: 'deploy' }, 0, 1), 'escalate');
  assert.equal(repairDecision({ ...retry, probabilities: { retry: 0.95, escalate: 0.8 } }, 0, 1), 'escalate');
  assert.equal(repairDecision({ ...retry, probabilities: { retry: 0.7, escalate: 0.3 } }, 0, 1), 'escalate');
});

test('runtime regression rolls back before a bounded repair and checks the replacement', async t => {
  const root = await mkdtemp(join(tmpdir(), 'forge-delivery-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const env = createEnvironment(root);
  const old = Buffer.from('{"status":200,"body":"previous"}');
  const baseline = await env.promote(old, () => true);
  const result = await runLifecycle(inputs, env, {
    probe: async (environment, attempt) => {
      const observed = await environment.observe();
      return { ...observed, status: attempt === 0 ? 503 : observed.status };
    },
    recommend: () => ({ choice: 'retry', probabilities: { retry: 1, escalate: 0 } }),
    onStage: async (stage) => {
      if (stage === 'repair') assert.equal(await env.active(), baseline.id);
    },
  });
  assert.deepEqual(result.stages, [
    'requirements', 'architecture', 'plan', 'build', 'test', 'deploy', 'observe',
    'rollback', 'repair', 'build', 'test', 'deploy', 'observe', 'evidence'
  ]);
  assert.equal((await env.observe()).body, 'ready');
});

test('rollback is terminal after budget exhaustion and unsigned bytes cannot be promoted', async t => {
  const root = await mkdtemp(join(tmpdir(), 'forge-delivery-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const env = createEnvironment(root);
  await assert.rejects(env.promote(build(requirements), () => false), /verified/);
  await assert.rejects(runLifecycle(inputs, env, {
    maxRepairs: 0, probe: () => ({ status: 503, body: 'unavailable' })
  }), /escalated/);
  assert.equal(await env.active(), null);
});

test('a stale rollback cannot undo a newer deployment of the same artifact', async t => {
  const root = await mkdtemp(join(tmpdir(), 'forge-delivery-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const environment = createEnvironment(root);
  const artifact = build(requirements);
  const first = await environment.promote(artifact, () => true);
  const second = await environment.promote(artifact, () => true);
  await assert.rejects(environment.rollback(first), /changed/);
  assert.equal(await environment.active(), second.id);
  await assert.rejects(environment.observe('//example.com'), /match/);
});

test('the same repair observation must fail before and pass after', () => {
  const failure = { path: '/ready', beforeStatus: 503, beforeBody: 'offline', afterStatus: 200, afterBody: 'ready' };
  const before = { path: '/ready', status: 503, body: 'offline' };
  const after = { path: '/ready', status: 200, body: 'ready' };
  assert.doesNotThrow(() => checkRepair(failure, before, after, failure));
  assert.throws(() => checkRepair(failure, before, before, failure), /same request/);
  assert.throws(() => checkRepair(failure, after, after, failure), /not reproduced/);
  assert.throws(() => checkRepair({ ...failure, beforeStatus: '503' }, before, after, failure), /HTTP status/);
});
