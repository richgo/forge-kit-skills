import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { selectStory, verifyTrace } from '../packages/requirements/checks/product-requirements.mjs';

const legacyFixture = new URL('./fixtures/legacy-product-requirements.json', import.meta.url);
const load = async () => JSON.parse(await readFile(legacyFixture));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('selects a stable story and traces both independently executable assertions', async () => {
  const requirements = await load();
  const story = selectStory(requirements, 'STORY-001');
  assert.equal(story.trace.epic, 'EPIC-001');
  assert.equal(story.trace.feature, 'FEAT-001');
  assert.equal(story.node, 'health_probe');
  assert.equal(story.expectedOutput, 'ready');
  assert.deepEqual(story.trace.criteria.map(item => item.id), ['AC-001', 'AC-002']);
  assert.throws(() => selectStory(requirements, 'STORY-002'), /Unknown story/);
});

test('rejects duplicates and acceptance criteria that cannot be executed', async () => {
  const requirements = await load();
  const feature = requirements.epics[0].features[0];
  feature.stories.push(structuredClone(feature.stories[0]));
  assert.throws(() => selectStory(requirements, 'STORY-001'), /Duplicate/);
  feature.stories.pop();
  feature.stories[0].acceptanceCriteria[0].then = { prose: 'it works' };
  assert.throws(() => selectStory(requirements, 'STORY-001'), /assertion/);
});

test('APMX verifies the story, observed outcome and deployed digest', async () => {
  const requirements = await readFile(legacyFixture);
  const { trace } = selectStory(JSON.parse(requirements), 'STORY-001');
  const artifact = Buffer.from('candidate');
  const plan = { requirement: trace.story, target: trace.node, trace, implementation: { mode: 'direct' }, maxRepairs: 1 };
  const receipt = {
    _type: 'https://in-toto.io/Statement/v1',
    predicateType: 'https://github.com/richgo/forge-kit/attestations/bootstrap/v3',
    subject: [{ name: 'deployed.mjs', digest: { sha256: digest(artifact) } }],
    predicate: {
      requirement: 'STORY-001',
      repairs: 0,
      implementation: plan.implementation,
      trace,
      materials: [{ name: 'product-requirements.json', digest: { sha256: digest(requirements) } }],
      stages: ['requirements', 'architecture', 'plan', 'build', 'test', 'deploy', 'observe', 'evidence', 'review-ready'],
      observation: { stdout: 'ready\n', exitCode: 0 },
    },
  };
  const report = verifyTrace(requirements, plan, receipt, artifact);
  assert.equal(report.trace.story, 'STORY-001');
  assert.equal(report.artifactSha256, digest(artifact));
  assert.throws(() => verifyTrace(requirements, plan, receipt, Buffer.from('modified')), /digest/);
  assert.throws(() => verifyTrace(requirements, { ...plan, target: 'wrong' }, receipt, artifact), /CALM node/);
  receipt.predicate.observation.stdout = 'broken\n';
  assert.throws(() => verifyTrace(requirements, plan, receipt, artifact), /AC-001/);
});
