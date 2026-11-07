import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

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
        for (const field of ['title', 'asA', 'iWant', 'soThat']) text(story[field], 'story ' + field);
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

export function verifyTrace(requirements, receipt, artifact) {
  assert.equal(receipt._type, 'https://in-toto.io/Statement/v1');
  assert.equal(receipt.predicateType, 'https://github.com/richgo/forge-kit/attestations/bootstrap/v3');
  const { predicate } = receipt;
  const { trace } = selectStory(JSON.parse(requirements), predicate.requirement);
  assert.deepEqual(predicate.trace, trace, 'Receipt story trace mismatch');
  const requirementsSha256 = sha256(requirements);
  assert.deepEqual(predicate.materials.filter(item => item.name === 'product-requirements.json'), [
    { name: 'product-requirements.json', digest: { sha256: requirementsSha256 } },
  ], 'Product requirements digest mismatch');
  const artifactSha256 = sha256(artifact);
  assert.deepEqual(receipt.subject, [
    { name: 'deployed.mjs', digest: { sha256: artifactSha256 } },
  ], 'Deployed artifact digest mismatch');
  const stages = ['requirements', 'architecture', 'plan', 'build', 'test'];
  if (predicate.stages.includes('repair')) stages.push('repair', 'build', 'test');
  stages.push('deploy', 'observe', 'evidence', 'review-ready');
  assert.deepEqual(predicate.stages, stages, 'Incomplete requirements-to-deployment evidence');
  const observation = predicate.observation;
  for (const criterion of trace.criteria) {
    for (const [field, value] of Object.entries(criterion.then)) {
      assert.equal(observation[field], field === 'stdout' ? value + '\n' : value, criterion.id + ' failed');
    }
  }
  return { requirementsSha256, artifactSha256, trace };
}
