import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  acceptanceSource, compileFixtureRequirements, fixtureIdentity, markdownPredicateType, markdownSource,
} from './fixture-requirements.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function text(value, field) {
  assert.ok(typeof value === 'string' && value.trim(), 'Missing ' + field);
}

function list(value, field) {
  assert.ok(Array.isArray(value) && value.length > 0, 'Expected a non-empty ' + field);
  return value;
}

export function selectStory(document, storyId) {
  assert.equal(document.schemaVersion, 1, 'Unsupported requirements schema version');
  const seen = new Set();
  const register = (item, prefix) => {
    const id = item.id;
    assert.ok(typeof id === 'string' && new RegExp('^' + prefix + '-[0-9]+$').test(id) &&
      id.trim() === id, 'Invalid ' + prefix + ' ID');
    assert.ok(!seen.has(id), 'Duplicate requirements ID ' + id);
    seen.add(id);
  };
  let selected;
  for (const epic of list(document.epics, 'epics list')) {
    register(epic, 'EPIC');
    text(epic.title, 'epic title');
    text(epic.outcome, 'epic outcome');
    for (const feature of list(epic.features, 'features list')) {
      register(feature, 'FEAT');
      text(feature.title, 'feature title');
      text(feature.outcome, 'feature outcome');
      for (const story of list(feature.stories, 'stories list')) {
        register(story, 'STORY');
        for (const field of story.description === undefined ? ['title', 'asA', 'iWant', 'soThat'] : ['title', 'description']) {
          text(story[field], 'story ' + field);
        }
        assert.match(story.architectureNode, /^[a-z][a-z0-9_]*$/, 'Invalid CALM node reference');
        const assertions = {};
        const criteria = list(story.acceptanceCriteria, 'acceptance criteria').map(item => {
          register(item, 'AC');
          text(item.given, 'criterion setup');
          assert.equal(item.when, 'run-readiness-probe', 'Unsupported acceptance action');
          assert.ok(item.then && typeof item.then === 'object' && !Array.isArray(item.then), 'Expected an executable assertion');
          const entries = Object.entries(item.then);
          assert.ok(entries.length > 0, 'Expected an executable assertion');
          for (const [field, value] of entries) {
            assert.ok(
              (field === 'stdout' && typeof value === 'string' && /^[a-z]{1,32}$/.test(value) && value.trim() === value) ||
              (field === 'exitCode' && value === 0),
              'Unsupported readiness assertion ' + field
            );
            assert.ok(!Object.hasOwn(assertions, field) || assertions[field] === value, 'Conflicting assertion ' + field);
            assertions[field] = value;
          }
          return { id: item.id, when: item.when, then: item.then };
        });
        assert.ok(Object.hasOwn(assertions, 'stdout') && Object.hasOwn(assertions, 'exitCode'),
          'A readiness story needs stdout and exitCode assertions');
        if (story.id === storyId) {
          selected = {
            id: story.id,
            summary: story.title,
            node: story.architectureNode,
            expectedOutput: assertions.stdout,
            trace: { epic: epic.id, feature: feature.id, story: story.id, node: story.architectureNode, criteria },
          };
        }
      }
    }
  }
  assert.ok(selected, 'Unknown story ' + storyId);
  return selected;
}

export function verifyTrace(requirements, plan, receipt, artifact, acceptance) {
  assert.equal(receipt._type, 'https://in-toto.io/Statement/v1');
  const markdown = acceptance !== undefined;
  assert.equal(receipt.predicateType, markdown ? markdownPredicateType :
    'https://github.com/richgo/forge-kit/attestations/bootstrap/v3');
  const { predicate } = receipt;
  const document = markdown ? compileFixtureRequirements(requirements, acceptance) : JSON.parse(requirements);
  const { trace } = selectStory(document, predicate.requirement);
  assert.deepEqual(plan.trace, trace, 'Plan story trace mismatch');
  assert.equal(plan.requirement, trace.story, 'Plan selects a different story');
  assert.equal(plan.target, trace.node, 'Plan targets a different CALM node');
  assert.deepEqual(plan.implementation, predicate.implementation, 'Plan implementation mismatch');
  assert.ok([0, 1].includes(plan.maxRepairs) && Number.isSafeInteger(predicate.repairs) &&
    predicate.repairs >= 0 && predicate.repairs <= plan.maxRepairs, 'Repair exceeds plan budget');
  assert.deepEqual(predicate.trace, trace, 'Receipt story trace mismatch');
  const requirementsSha256 = sha256(requirements);
  const sources = markdown ? [markdownSource, acceptanceSource] : ['product-requirements.json'];
  const identity = markdown ? fixtureIdentity(requirements, acceptance, document) : undefined;
  assert.deepEqual(predicate.materials.filter(item => sources.includes(item.name)), [
    { name: sources[0], digest: { sha256: requirementsSha256 } },
    ...(markdown ? [{ name: acceptanceSource, digest: { sha256: identity.acceptanceSha256 } }] : []),
  ], 'Product requirements digest mismatch');
  if (markdown) assert.deepEqual(predicate.requirements, identity, 'Requirements compiler identity mismatch');
  const artifactSha256 = sha256(artifact);
  assert.deepEqual(receipt.subject, [
    { name: 'deployed.mjs', digest: { sha256: artifactSha256 } },
  ], 'Deployed artifact digest mismatch');
  const stages = ['requirements', 'architecture', 'plan', 'build', 'test'];
  if (predicate.repairs) stages.push('repair', 'build', 'test');
  stages.push('deploy', 'observe', 'evidence', 'review-ready');
  assert.deepEqual(predicate.stages, stages, 'Incomplete requirements-to-deployment evidence');
  const observation = predicate.observation;
  for (const criterion of trace.criteria) {
    for (const [field, value] of Object.entries(criterion.then)) {
      assert.equal(observation[field], field === 'stdout' ? value + '\n' : value, criterion.id + ' failed');
    }
  }
  return { requirementsSha256, artifactSha256, trace, ...(markdown && { requirements: identity }) };
}
