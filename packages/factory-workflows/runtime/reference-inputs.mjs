import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateHttpExpectation } from '../../acceptance/checks/acceptance.mjs';
import { parseMarkdownRequirements } from '../../requirements/checks/markdown-requirements.mjs';

const referenceDirectory = new URL('../../../examples/reference/', import.meta.url);

export async function readReferenceInputs(directory = referenceDirectory) {
  const [requirementsSource, acceptanceFixture, architecture, view] = await Promise.all(
    ['product-requirements.md', 'acceptance.json', 'architecture.json', 'architecture.c4']
      .map(name => readFile(new URL(name, directory)))
  );
  const { epics } = parseMarkdownRequirements(requirementsSource);
  const stories = epics.flatMap(epic => epic.features.flatMap(feature => feature.stories));
  assert.equal(stories.length, 1, 'Expected one reference story');
  const [story] = stories;
  assert.equal(story.nodes.length, 1, 'Expected one reference architecture owner');
  assert.equal(story.acceptanceCriteria.length, 1, 'Expected one reference acceptance criterion');
  const [criterion] = story.acceptanceCriteria;
  const check = JSON.parse(acceptanceFixture);
  assert.ok(check && typeof check === 'object' && !Array.isArray(check), 'Expected an HTTP acceptance fixture');
  assert.deepEqual(Object.keys(check).sort(), ['body', 'id', 'path', 'status'], 'Unexpected HTTP acceptance fields');
  assert.equal(check.id, criterion.check, 'HTTP acceptance check ID differs from the story');
  const { path, status, body } = check;
  validateHttpExpectation({ path, status, body });
  const id = story.id.replace(/^STORY-/, 'REQ-');
  const requirements = Buffer.from(JSON.stringify([{ id, node: story.nodes[0], path, status, body }]) + '\n');
  return { requirements, requirementsSource, acceptanceFixture, architecture, view };
}
