import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateArchitecture } from '../../architecture/checks/architecture.mjs';
import { checkCandidate, signReceipt, verifyReceipt } from '../../acceptance/checks/acceptance.mjs';
import { createEnvironment } from '../../delivery/runtime/delivery.mjs';
import { build, jevRepair, runLifecycle } from './lifecycle.mjs';

const [command, directory, flag] = process.argv.slice(2);
assert.ok(directory, 'Supply an output directory');
const names = { requirements: 'requirements.json', architecture: 'architecture.json', view: 'architecture.c4' };
const inputs = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([key, name]) => [
  key, await readFile(new URL('../../../examples/reference/' + name, import.meta.url)),
])));
const save = (name, bytes) => writeFile(join(directory, name), bytes, { flag: 'wx' });
const read = name => readFile(join(directory, name));
await mkdir(directory, { recursive: true });

if (command === 'build') {
  validateArchitecture(inputs);
  await save('candidate.json', build(inputs.requirements));
} else if (command === 'check') {
  validateArchitecture(inputs);
  const signer = generateKeyPairSync('ed25519');
  const receipt = checkCandidate(await read('candidate.json'), inputs);
  await save('receipt.dsse.json', JSON.stringify(signReceipt(receipt, signer.privateKey)));
  const trustedKey = signer.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  console.log(trustedKey);
} else if (command === 'deliver') {
  const trustedKey = createPublicKey({ key: Buffer.from(process.env.FORGE_CHECKER_PUBLIC_KEY ?? '', 'base64'), format: 'der', type: 'spki' });
  const envelope = JSON.parse(await read('receipt.dsse.json'));
  const candidate = await read('candidate.json');
  const [{ path, status, body }] = JSON.parse(inputs.requirements);
  const environment = createEnvironment(join(directory, 'environment'));
  const promotion = await environment.promote(candidate, bytes => verifyReceipt(envelope, trustedKey, bytes, inputs));
  let observation;
  try {
    observation = await environment.observe(path);
    assert.deepEqual(observation, { id: promotion.id, status, body }, 'Readiness failed');
  } catch (error) {
    await environment.rollback(promotion);
    throw error;
  }
  await save('observation.json', JSON.stringify(observation));
} else if (command === 'rehearse') {
  const simulate = flag === '--fail-first-observation';
  const result = await runLifecycle(inputs, createEnvironment(join(directory, 'environment')), {
    recommend: process.env.FORGE_JEV_TOKEN
      ? () => jevRepair(process.env.FORGE_JEV_TOKEN)
      : () => ({ choice: 'retry', probabilities: { retry: 1, escalate: 0 } }),
    probe: async (env, attempt, path) => {
      const response = await env.observe(path);
      return simulate && attempt === 0 ? { ...response, status: 503 } : response;
    },
  });
  await save('lifecycle.json', JSON.stringify(result, null, 2));
} else {
  throw new Error('Expected build, check, deliver or rehearse');
}
