import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const schema = 'https://calm.finos.org/release/1.2/meta/calm.json';
const identifier = '[A-Za-z_][A-Za-z0-9_]*';
const nodeId = new RegExp('^' + identifier + '$');
const text = value => typeof value === 'string' && value.trim().length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const sorted = values => [...values].sort();
const union = (left, right) => sorted(new Set([...left, ...right]));
const tuple = (...parts) => JSON.stringify(parts);
const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);

function add(index, id, value, kind) {
  assert.ok(!index.has(id), 'Duplicate ' + kind + ' ID ' + id);
  index.set(id, value);
}

function graph(calm) {
  assert.ok(keys(calm, ['$schema', 'nodes', 'relationships']) && calm.$schema === schema &&
    Array.isArray(calm.nodes) && Array.isArray(calm.relationships), 'Expected a flat CALM 1.2 nodes/relationships document');
  const nodes = new Map();
  const relationships = new Map();
  for (const node of calm.nodes) {
    assert.ok(keys(node, ['unique-id', 'node-type', 'name', 'description']), 'Unsupported CALM node fields');
    const { 'unique-id': id, 'node-type': type, name, description } = node;
    assert.ok(matches(id, nodeId) && matches(type, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/) &&
      text(name) && text(description), 'Invalid CALM node');
    add(nodes, id, node, 'CALM node');
  }
  for (const relationship of calm.relationships) {
    assert.ok(keys(relationship, ['unique-id', 'description', 'relationship-type']), 'Unsupported CALM relationship fields');
    const { 'unique-id': id, 'relationship-type': type, description } = relationship;
    assert.ok(text(id) && (description === undefined || text(description)), 'Invalid CALM relationship');
    assert.ok(keys(type, ['connects']) && keys(type.connects, ['source', 'destination']), 'Unsupported CALM relationship type for ' + id + '. Expected connects.');
    const { source, destination } = type.connects;
    assert.ok(keys(source, ['node']) && keys(destination, ['node']) && nodes.has(source.node) &&
      nodes.has(destination.node), 'Invalid or unknown CALM endpoint for ' + id);
    add(relationships, id, { source: source.node, destination: destination.node, description }, 'CALM relationship');
  }
  return { nodes, relationships };
}

function validateView(view, { nodes, relationships }) {
  // This is the flat projection emitted by the website and readiness examples.
  const lines = view.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('//'));
  let cursor = 0;
  const consume = expected => assert.equal(lines[cursor++], expected, 'Expected LikeC4 ' + expected);
  const parse = (pattern, kind) => {
    const match = pattern.exec(lines[cursor] ?? '');
    assert.ok(match, 'Unsupported LikeC4 ' + kind + ' at statement ' + (cursor + 1));
    cursor++;
    return match.slice(1);
  };
  const declaration = new RegExp('^element\\s+(' + identifier + ')$');
  const label = /("[^"\\]*"|'[^'\\]*')/.source;
  const element = new RegExp('^(' + identifier + ')\\s*=\\s*(' + identifier + ')\\s+' + label + '$');
  const edge = new RegExp('^(' + identifier + ')\\s*->\\s*(' + identifier + ')(?:\\s+' + label + ')?$');
  const viewDeclaration = new RegExp('^view\\s+(' + identifier + ')\\s*\\{$');
  consume('specification {');
  const kinds = new Set();
  while (lines[cursor] !== '}') {
    const [kind] = parse(declaration, 'element kind');
    assert.ok(!kinds.has(kind), 'Duplicate LikeC4 element kind ' + kind);
    kinds.add(kind);
  }
  consume('}');
  consume('model {');
  const seenNodes = new Map();
  const seenEdges = [];
  while (lines[cursor] !== '}') {
    if (element.test(lines[cursor] ?? '')) {
      const [id, kind, name] = parse(element, 'element');
      const expected = nodes.get(id);
      assert.ok(expected && kinds.has(kind) && kind === expected['node-type'].replaceAll('-', '_') &&
        name.slice(1, -1) === expected.name, 'LikeC4 element ' + id + ' differs from CALM');
      add(seenNodes, id, true, 'LikeC4 element');
    } else {
      const [source, destination, description] = parse(edge, 'model statement');
      seenEdges.push(tuple(source, destination, description?.slice(1, -1)));
    }
  }
  assert.deepEqual(sorted(seenNodes.keys()), sorted(nodes.keys()), 'LikeC4 elements differ from CALM');
  const expectedEdges = [...relationships.values()].map(({ source, destination, description }) => tuple(source, destination, description));
  assert.deepEqual(seenEdges.sort(), expectedEdges.sort(), 'LikeC4 relationships differ from CALM');
  consume('}');
  consume('views {');
  const [name] = parse(viewDeclaration, 'view declaration');
  consume('include *');
  consume('}');
  consume('}');
  assert.equal(cursor, lines.length, 'Unexpected statements after the LikeC4 view');
  return name;
}

function requirementsIndex(requirements, nodes) {
  assert.ok(record(requirements) && requirements.schemaVersion === 1 && Array.isArray(requirements.epics),
    'Expected schemaVersion 1 product requirements with epics');
  const { schemaVersion, epics: groups, ...product } = requirements;
  const epics = new Map();
  const features = new Map();
  const stories = new Map();
  const acceptance = new Map();
  for (const { id: epicId, features: children, ...epic } of groups) {
    assert.ok(matches(epicId, /^EPIC-\d+$/) && text(epic.title) && text(epic.outcome) && Array.isArray(children), 'Invalid requirement epic');
    add(epics, epicId, epic, 'epic');
    for (const { id: featureId, stories: items, ...feature } of children) {
      assert.ok(matches(featureId, /^FEAT-\d+$/) && text(feature.title) && text(feature.outcome) && Array.isArray(items), 'Invalid requirement feature');
      add(features, featureId, { ...feature, epicId }, 'feature');
      for (const { id: storyId, acceptanceCriteria, ...story } of items) {
        assert.ok(matches(storyId, /^STORY-\d+$/) && ['title', 'asA', 'iWant', 'soThat'].every(field => text(story[field])) &&
          Array.isArray(acceptanceCriteria) && acceptanceCriteria.length > 0, 'Invalid requirement story ' + storyId);
        assert.ok(nodes.has(story.architectureNode), 'Unknown CALM owner for ' + storyId);
        add(stories, storyId, { ...story, epicId, featureId }, 'story');
        for (const { id, ...criterion } of acceptanceCriteria) {
          assert.ok(matches(id, /^AC-\d+$/) && text(criterion.given) && text(criterion.when) && record(criterion.then) &&
            Object.keys(criterion.then).length > 0, 'Invalid acceptance criterion ' + id);
          add(acceptance, id, { ...criterion, storyId }, 'acceptance');
        }
      }
    }
  }
  return { epics, features, stories, acceptance, product: new Map(Object.entries(product)) };
}

function diff(before, after) {
  const changes = [];
  for (const id of union(before.keys(), after.keys())) {
    if (!before.has(id)) changes.push({ id, change: 'added' });
    else if (!after.has(id)) changes.push({ id, change: 'removed' });
    else if (!isDeepStrictEqual(before.get(id), after.get(id))) changes.push({ id, change: 'changed' });
  }
  return changes;
}

function consumerClosure({ nodes, relationships }, seeds) {
  const consumers = new Map([...nodes.keys()].map(id => [id, []]));
  for (const { source, destination } of relationships.values()) consumers.get(destination).push(source);
  const reached = new Set([...seeds].filter(id => nodes.has(id)));
  for (const id of reached) {
    for (const consumer of consumers.get(id)) reached.add(consumer);
  }
  return reached;
}

function snapshot({ requirements, calm, view }) {
  const architecture = graph(calm);
  const viewName = validateView(view, architecture);
  return { ...architecture, view: viewName, ...requirementsIndex(requirements, architecture.nodes) };
}

export function planImpact(beforeInput, afterInput) {
  const before = snapshot(beforeInput);
  const after = snapshot(afterInput);
  const changes = Object.fromEntries(['nodes', 'relationships', 'epics', 'features', 'stories', 'acceptance', 'product']
    .map(key => [key, diff(before[key], after[key])]));
  changes.views = diff(new Map([[before.view, true]]), new Map([[after.view, true]]));
  changes.relationships = changes.relationships.map(change => ({
    ...change, before: before.relationships.get(change.id) ?? null, after: after.relationships.get(change.id) ?? null,
  }));
  const seeds = new Set(changes.nodes.map(({ id }) => id));
  for (const relationship of changes.relationships) {
    if (relationship.before) seeds.add(relationship.before.source);
    if (relationship.after) seeds.add(relationship.after.source);
  }
  const beforeImpact = consumerClosure(before, seeds);
  const afterImpact = consumerClosure(after, seeds);
  const impactedNodes = new Set(union(beforeImpact, afterImpact));
  const changedIds = Object.fromEntries(Object.entries(changes).map(([key, rows]) => [key, new Set(rows.map(({ id }) => id))]));
  const impactedStories = [];
  const acceptanceToRun = new Set();
  const acceptanceRemoved = [];
  const changedAcceptanceStories = new Set();
  for (const id of union(before.acceptance.keys(), after.acceptance.keys())) {
    const oldCriterion = before.acceptance.get(id);
    const newCriterion = after.acceptance.get(id);
    if (oldCriterion && newCriterion) {
      assert.equal(oldCriterion.storyId, newCriterion.storyId, 'Acceptance ID moved to a different story: ' + id);
    }
    if (changedIds.acceptance.has(id)) {
      if (oldCriterion) changedAcceptanceStories.add(oldCriterion.storyId);
      if (newCriterion) changedAcceptanceStories.add(newCriterion.storyId);
      if (newCriterion) acceptanceToRun.add(id);
    }
    if (!newCriterion) acceptanceRemoved.push(id);
  }
  const requirementSeeds = { before: new Set(), after: new Set() };
  for (const [side, state] of Object.entries({ before, after })) {
    for (const [id, story] of state.stories) {
      if (changedAcceptanceStories.has(id) || changedIds.stories.has(id) ||
          changedIds.features.has(story.featureId) || changedIds.epics.has(story.epicId)) {
        requirementSeeds[side].add(story.architectureNode);
      }
    }
  }
  const dependencies = {
    before: consumerClosure(before, requirementSeeds.before),
    after: consumerClosure(after, requirementSeeds.after),
  };
  for (const id of union(dependencies.before, dependencies.after)) impactedNodes.add(id);
  const consumerAffected = (side, owner) => dependencies[side].has(owner) && !requirementSeeds[side].has(owner);
  const wholeStories = new Set();
  for (const id of union(before.stories.keys(), after.stories.keys())) {
    const oldStory = before.stories.get(id);
    const newStory = after.stories.get(id);
    const owners = { before: oldStory?.architectureNode ?? null, after: newStory?.architectureNode ?? null };
    const reasons = [
      [beforeImpact.has(owners.before) || afterImpact.has(owners.after), 'architecture'],
      [consumerAffected('before', owners.before) || consumerAffected('after', owners.after), 'dependency'],
      [changedIds.stories.has(id), 'story'],
      [changedIds.features.has(oldStory?.featureId) || changedIds.features.has(newStory?.featureId), 'feature'],
      [changedIds.epics.has(oldStory?.epicId) || changedIds.epics.has(newStory?.epicId), 'epic'],
      [changes.product.length > 0, 'product'],
    ].filter(([applies]) => applies).map(([, reason]) => reason);
    if (reasons.length) wholeStories.add(id);
    if (changedAcceptanceStories.has(id)) reasons.push('acceptance');
    if (reasons.length) {
      impactedStories.push({ id, owners, reasons });
      if (owners.before) impactedNodes.add(owners.before);
      if (owners.after) impactedNodes.add(owners.after);
    }
  }
  for (const [id, criterion] of after.acceptance) {
    if (wholeStories.has(criterion.storyId)) acceptanceToRun.add(id);
  }
  return {
    schemaVersion: 1,
    models: {
      before: { source: beforeInput.source ?? 'authored', view: before.view },
      after: { source: afterInput.source ?? 'authored', view: after.view },
    },
    changes,
    scope: {
      architectureSeeds: sorted(seeds),
      requirementSeeds: union(requirementSeeds.before, requirementSeeds.after),
      architectureConsumers: { before: sorted(beforeImpact), after: sorted(afterImpact) },
      nodes: sorted(impactedNodes),
      stories: impactedStories,
      acceptanceToRun: sorted(acceptanceToRun),
      acceptanceRemoved,
    },
  };
}
