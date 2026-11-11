import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseMarkdownRequirements } from './markdown-requirements.mjs';

export const markdownSource = 'product-requirements.md';
export const acceptanceSource = 'acceptance.json';
export const markdownPredicateType = 'https://github.com/richgo/forge-kit/attestations/bootstrap/v4';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function requirementsIdentity(markdown, normalized) {
  return {
    compiler: 'forgekit-requirements/markdown-v1',
    sourceSha256: sha256(markdown),
    normalizedSha256: sha256(JSON.stringify(normalized)),
  };
}

export function compileFixtureRequirements(markdown, acceptance, catalog) {
  const requirements = parseMarkdownRequirements(markdown);
  const checks = JSON.parse(acceptance);
  assert.ok(Array.isArray(checks), 'Expected an independent acceptance fixture array');
  const byCheck = new Map(checks.map(check => {
    assert.ok(check && typeof check.id === 'string' && typeof check.story === 'string' &&
      typeof check.when === 'string' && check.then && typeof check.then === 'object' &&
      !Array.isArray(check.then), 'Invalid independent acceptance fixture');
    return [check.id, check];
  }));
  assert.equal(byCheck.size, checks.length, 'Duplicate independent check ID');
  const used = new Set();
  const epics = requirements.epics.map(epic => ({
    ...epic,
    features: epic.features.map(feature => ({
      ...feature,
      stories: feature.stories.map(story => {
        assert.equal(story.nodes.length, 1, 'This fixture requires one architecture owner');
        const narrative = /^As (?:an? )?(.+?), I want (.+?) so that (.+)\.$/u.exec(story.description);
        const [, asA, iWant, soThat] = narrative ?? [];

        const acceptanceCriteria = story.acceptanceCriteria.map(criterion => {
          const check = byCheck.get(criterion.check);
          assert.ok(check && check.story === story.id,
            'Unknown or mismatched independent check ' + criterion.check);
          assert.ok(!used.has(criterion.check), 'Repeated independent check ' + criterion.check);
          used.add(criterion.check);
          return { id: criterion.id, given: criterion.given, when: check.when, then: check.then };
        });
        return {
          id: story.id, title: story.title, ...(narrative ? { asA, iWant, soThat } : { description: story.description }),
          architectureNode: story.nodes[0], acceptanceCriteria,
        };
      }),
    })),
  }));
  assert.equal(used.size, checks.length, 'Unreferenced independent acceptance check');
  if (catalog) {
    assert.equal(catalog.product, 'Trail Desk', 'Unknown catalog profile');
    assert.ok(Array.isArray(catalog.trails), 'Catalog must supply trails');
  }
  return {
    schemaVersion: requirements.schemaVersion,
    ...(catalog && { product: catalog.product, trails: catalog.trails }),
    epics,
  };
}

export function fixtureIdentity(markdown, acceptance, normalized, catalog) {
  return {
    ...requirementsIdentity(markdown, normalized),
    acceptanceSha256: sha256(acceptance),
    ...(catalog && { catalogSha256: sha256(catalog) }),
  };
}
