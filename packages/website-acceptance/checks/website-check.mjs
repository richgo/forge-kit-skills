
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [requirements, architecture, site, report] = await Promise.all([
  'product-requirements.json', 'architecture.json', 'index.html', 'requirements-verification.json',
].map(file => readFile(file)));
const digest = value => createHash('sha256').update(value).digest('hex');
const nodes = new Set(JSON.parse(architecture).nodes.map(node => node['unique-id']));
const stories = JSON.parse(requirements).epics.flatMap(epic =>
  epic.features.flatMap(feature => feature.stories));
const acceptance = stories.flatMap(story => {
  assert.ok(nodes.has(story.architectureNode), 'Missing CALM owner for ' + story.id);
  return story.acceptanceCriteria.map(criterion => criterion.id);
});
assert.ok(acceptance.length > 0);
assert.equal(new Set(acceptance).size, acceptance.length);
assert.deepEqual(JSON.parse(report), {
  requirementsSha256: digest(requirements),
  architectureSha256: digest(architecture),
  siteSha256: digest(site),
  acceptance,
});
