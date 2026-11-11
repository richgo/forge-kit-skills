
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { compileFixtureRequirements, fixtureIdentity } from './fixture-requirements.mjs';

const [requirements, fixture, catalog, architecture, view, site, report] = await Promise.all([
  'product-requirements.md', 'acceptance.json', 'catalog.json', 'architecture.json', 'architecture.c4', 'index.html', 'requirements-verification.json',
].map(file => readFile(file)));
const digest = value => createHash('sha256').update(value).digest('hex');
const nodes = new Set(JSON.parse(architecture).nodes.map(node => node['unique-id']));
const document = compileFixtureRequirements(requirements, fixture, JSON.parse(catalog));
const stories = document.epics.flatMap(epic =>
  epic.features.flatMap(feature => feature.stories));
const acceptance = stories.flatMap(story => {
  assert.ok(nodes.has(story.architectureNode), 'Missing CALM owner for ' + story.id);
  return story.acceptanceCriteria.map(criterion => criterion.id);
});
assert.ok(acceptance.length > 0);
assert.equal(new Set(acceptance).size, acceptance.length);
assert.deepEqual(JSON.parse(report), {
  requirementsSha256: digest(requirements),
  requirements: fixtureIdentity(requirements, fixture, document, catalog),
  architectureSha256: digest(architecture),
  viewSha256: digest(view),
  siteSha256: digest(site),
  acceptance,
});
