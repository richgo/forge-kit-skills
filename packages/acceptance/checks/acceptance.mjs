import assert from 'node:assert/strict';
import { createHash, sign, verify } from 'node:crypto';

export const predicateType = 'https://github.com/richgo/forge-kit-skills/attestations/acceptance/v1';
const markdownPredicateType = 'https://github.com/richgo/forge-kit-skills/attestations/acceptance/v2';
const payloadType = 'application/vnd.in-toto+json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateHttpExpectation({ path, status, body }) {
  assert.match(path, /^\/[a-z][a-z0-9/-]*$/);
  assert.ok(Number.isInteger(status) && status >= 200 && status < 600 && ![204, 205, 304].includes(status));
  assert.ok(typeof body === 'string' && Buffer.byteLength(body) <= 1024);
}

export function checkCandidate(artifact, inputs) {
  const requirements = JSON.parse(inputs.requirements);
  assert.ok(Array.isArray(requirements) && requirements.length === 1, 'Expected one reference requirement');
  const [{ id, node, path, status, body }] = requirements;
  assert.match(id, /^REQ-[0-9]+$/);
  validateHttpExpectation({ path, status, body });
  assert.ok(artifact.length <= 4096, 'Candidate exceeds size limit');
  assert.deepEqual(JSON.parse(artifact), { path, status, body }, 'Candidate failed HTTP acceptance');
  const names = ['requirements', 'architecture', 'view'];
  const markdown = Object.hasOwn(inputs, 'requirementsSource') || Object.hasOwn(inputs, 'acceptanceFixture');
  if (markdown) {
    assert.ok(Buffer.isBuffer(inputs.requirementsSource) && Buffer.isBuffer(inputs.acceptanceFixture),
      'Expected both Markdown requirements and acceptance fixture bytes');
    names.push('requirementsSource', 'acceptanceFixture');
  }
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: 'candidate.json', digest: { sha256: sha256(artifact) } }],
    predicateType: markdown ? markdownPredicateType : predicateType,
    predicate: {
      requirement: id,
      node,
      result: 'passed',
      materials: Object.fromEntries(names.map(name => [name, sha256(inputs[name])])),
      ...(markdown && { requirementsCompiler: 'forgekit-requirements/markdown-v1' }),
    },
  };
}

function pae(payload) {
  return Buffer.concat([Buffer.from('DSSEv1 ' + payloadType.length + ' ' + payloadType + ' ' + payload.length + ' '), payload]);
}

export function signReceipt(statement, privateKey) {
  const payload = Buffer.from(JSON.stringify(statement));
  return {
    payloadType,
    payload: payload.toString('base64'),
    signatures: [{ keyid: '', sig: sign(null, pae(payload), privateKey).toString('base64') }],
  };
}

export function verifyReceipt(envelope, publicKey, artifact, inputs) {
  assert.equal(envelope.payloadType, payloadType);
  assert.equal(envelope.signatures.length, 1);
  const payload = Buffer.from(envelope.payload, 'base64');
  const signature = Buffer.from(envelope.signatures[0].sig, 'base64');
  assert.ok(verify(null, pae(payload), publicKey, signature), 'Independent checker signature rejected');
  assert.deepEqual(JSON.parse(payload), checkCandidate(artifact, inputs), 'Acceptance receipt does not bind current inputs and candidate');
  return true;
}
