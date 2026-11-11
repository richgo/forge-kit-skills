import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseMarkdownRequirements } from '../packages/requirements/checks/markdown-requirements.mjs';

const source = [
  '# Product requirements',
  '',
  '## Epic EPIC-001 — Delivery confidence',
  'Outcome: Operators can see when releases are ready.',
  '',
  '### Feature FEAT-001 — Readiness reporting',
  'Outcome: Report readiness for the current release.',
  '',
  '#### Story STORY-001 — Check readiness',
  'Architecture owner: `health_probe`, `release-status`',
  '',
  'As an operator, I want to check whether my release is ready.',
  'I need the result before starting promotion.',
  '',
  '##### Acceptance AC-001 — Report the status',
  '- Given a verified release',
  '- When I request its status',
  '- Then I see that the release is ready',
  '- Check: `release.status`',
  '',
  '##### Acceptance AC-002 — Return success',
  '- Given a verified release',
  '- When I request its status',
  '- Then the request succeeds',
  '- Check: `release.success`',
  '',
].join('\n');

test('compiles a UTF-8 Markdown source into the versioned requirements tree', () => {
  const requirements = parseMarkdownRequirements(Buffer.from('\uFEFF' + source.replaceAll('\n', '\r\n')));
  assert.deepEqual(requirements, {
    schemaVersion: 1,
    epics: [{
      id: 'EPIC-001',
      title: 'Delivery confidence',
      outcome: 'Operators can see when releases are ready.',
      features: [{
        id: 'FEAT-001',
        title: 'Readiness reporting',
        outcome: 'Report readiness for the current release.',
        stories: [{
          id: 'STORY-001',
          title: 'Check readiness',
          description: 'As an operator, I want to check whether my release is ready.\n' +
            'I need the result before starting promotion.',
          nodes: ['health_probe', 'release-status'],
          acceptanceCriteria: [{
            id: 'AC-001',
            title: 'Report the status',
            given: 'a verified release',
            when: 'I request its status',
            then: 'I see that the release is ready',
            check: 'release.status',
          }, {
            id: 'AC-002',
            title: 'Return success',
            given: 'a verified release',
            when: 'I request its status',
            then: 'the request succeeds',
            check: 'release.success',
          }],
        }],
      }],
    }],
  });
});

test('keeps sibling epics, features, and stories under the declared parent', () => {
  const story = source.slice(source.indexOf('#### Story'));
  const feature = source.slice(source.indexOf('### Feature'));
  const epic = source.slice(source.indexOf('## Epic'));
  const replaceIds = (block, first, second) => block
    .replaceAll(/(EPIC|FEAT|STORY|AC)-001/g, '$1-' + first)
    .replaceAll('AC-002', 'AC-' + second);
  const document = parseMarkdownRequirements(source + '\n' + replaceIds(story, '003', '004') +
    '\n' + replaceIds(feature, '005', '006') + '\n' + replaceIds(epic, '007', '008'));
  const [first, second] = document.epics;
  assert.deepEqual(first.features.map(item => item.id), ['FEAT-001', 'FEAT-005']);
  assert.deepEqual(first.features[0].stories.map(item => item.id), ['STORY-001', 'STORY-003']);
  assert.deepEqual(first.features[1].stories.map(item => item.id), ['STORY-005']);
  assert.deepEqual(second.features.map(item => item.id), ['FEAT-007']);
});

for (const [name, input, error] of [
  ['unknown document format', source.replace('# Product requirements', '# Other requirements'), /Product requirements/],
  ['body before epics', source.replace('## Epic', 'Unexpected text\n\n## Epic'), /line 3/],
  ['empty requirements', '# Product requirements\n', /Epic/],
  ['epic without features', source.slice(0, source.indexOf('### Feature')), /Feature/],
  ['feature without stories', source.slice(0, source.indexOf('#### Story')), /Story/],
  ['story without acceptance criteria', source.slice(0, source.indexOf('##### Acceptance')), /Acceptance/],
  ['missing outcomes', source.replace('Outcome: ', ''), /Outcome/],
  ['empty description', source.replace(/As an operator.*\nI need.*\n/, ''), /description/i],
  ['missing description separator', source.replace('`release-status`\n\n', '`release-status`\n'), /blank line/],
  ['unquoted owner', source.replace('`health_probe`', 'health_probe'), /Architecture owner/],
  ['duplicate owner', source.replace('release-status', 'health_probe'), /Duplicate.*owner/],
  ['malformed story heading', source.replace('#### Story', '### Story'), /heading/],
  ['empty story title', source.replace(' — Check readiness', ' — '), /heading/],
  ['duplicate criteria IDs', source.replace('AC-002', 'AC-001'), /Duplicate.*AC-001/],
  ['duplicate IDs in different epics', source + source.slice(source.indexOf('## Epic')).replace('EPIC-001', 'EPIC-002'), /Duplicate.*FEAT-001/],
  ['unknown heading in narrative', source.replace('I need the result', '###### Notes\nI need the result'), /heading/],
  ['commented-out heading', source.replace('#### Story', '<!--\n#### Story').replace('- Check: `release.success`', '- Check: `release.success`\n-->'), /line 9/],
  ['comment in a structural heading', source.replace('Delivery confidence', 'Delivery confidence <!--').replace('the release is ready', 'the release is ready -->'), /line 3/],
  ['missing criterion field', source.replace('- Given a verified release\n', ''), /Given/],
  ['duplicate criterion field', source.replace('- When ', '- Given unexpected\n- When '), /When/],
  ['extra criterion field', source.replace('- Check: `release.status`', '- Check: `release.status`\n- Extra item'), /unexpected/i],
  ['unsafe check ID', source.replace('release.status', 'release.status; exit 0'), /Check/],
  ['invalid UTF-8', Buffer.concat([Buffer.from(source), Buffer.from([0xff])]), /UTF-8/],
]) {
  test('rejects ' + name, () => {
    assert.throws(() => parseMarkdownRequirements(input), error);
  });
}

test('the public requirements template compiles as authored', async () => {
  const template = new URL('../packages/requirements/templates/product-requirements.md', import.meta.url);
  const requirements = parseMarkdownRequirements(await readFile(template));
  assert.equal(requirements.schemaVersion, 1);
  assert.ok(requirements.epics[0].features[0].stories[0].acceptanceCriteria.length);
});
