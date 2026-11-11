import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { parseMarkdownRequirements } from './markdown-requirements.mjs';

const protectedDirectories = new Set([
  '.forge', 'checks', '.github', '.git', '.apm', 'apm_modules', '_apmx_source', '_apmx_context',
]);
const protectedFiles = new Set([
  'apm.yml', 'apm.lock', 'apm.lock.yaml', 'apm-policy.yml', 'request.md', 'product-requirements.md',
  'plan.md', 'specification.md', 'implementation.md', 'review.md', 'changes.diff',
]);
const decoder = new TextDecoder('utf-8', { fatal: true });

function protectedPath(path) {
  const normalized = path.toLowerCase();
  return protectedDirectories.has(normalized.split('/')[0])
    || protectedFiles.has(normalized) || normalized.endsWith('.contract.md');
}

function readApproved(path) {
  assert.ok(lstatSync(path).isFile(), 'Approved file must be a regular file: ' + path);
  return decoder.decode(readFileSync(path));
}

function sourcePath(value) {
  return value.split('/').every(part =>
    part && !/[<>:"\\|?*\x00-\x1f\x7f]/.test(part) && !/[. ]$/.test(part)
  );
}

function parseRequest(raw) {
  const [heading, ...lines] = raw.trim().split(/\r?\n/);
  assert.equal(heading, '# Approved change request', 'Expected an approved change request');
  const sections = new Map();
  let section;
  for (const line of lines.map(line => line.trim()).filter(Boolean)) {
    if (line.startsWith('#')) {
      section = line;
      assert.ok(['## Stories', '## Allowed source paths', '## Constraints'].includes(section),
        'Unexpected request heading: ' + section);
      assert.ok(!sections.has(section), 'Duplicate request heading: ' + section);
      sections.set(section, []);
    } else if (section !== '## Constraints') {
      assert.ok(section, 'Expected a request section before: ' + line);
      const entry = /^- `([^`]+)`$/.exec(line)?.[1];
      assert.ok(entry, 'Expected a backtick-delimited request entry: ' + line);
      const entries = sections.get(section);
      assert.ok(!entries.includes(entry), 'Duplicate request entry: ' + entry);
      entries.push(entry);
    }
  }

  const stories = sections.get('## Stories');
  const paths = sections.get('## Allowed source paths');
  assert.ok(stories?.length, 'The request must select at least one story');
  assert.ok(paths?.length, 'The request must allow at least one source path');
  for (const path of paths) {
    assert.ok(sourcePath(path) && !protectedPath(path), 'Invalid or protected source path: ' + path);
  }
  return { stories, paths: new Set(paths) };
}

function approvedChange() {
  const requirements = parseMarkdownRequirements(readApproved('product-requirements.md'));
  const { stories, paths } = parseRequest(readApproved('request.md'));
  const catalogue = new Map(requirements.epics.flatMap(epic =>
    epic.features.flatMap(feature => feature.stories.map(story => [story.id, story]))
  ));
  const checks = new Set();
  for (const id of stories) {
    const story = catalogue.get(id);
    assert.ok(story, 'Unknown selected story ' + id);
    for (const criterion of story.acceptanceCriteria) {
      checks.add(criterion.check);
    }
  }
  assert.ok(checks.size, 'The selected stories must have acceptance checks');
  return { checks, paths };
}

function verifyPatch(patch, { checks, paths }) {
  const patchStat = lstatSync(patch);
  assert.ok(patchStat.isFile() && patchStat.size, 'A nonempty regular patch is required');
  assert.ok(lstatSync('.forge').isDirectory() && lstatSync('.forge/verify-change').isFile(),
    'A reviewed .forge/verify-change file is required');
  execFileSync('git', ['apply', '--check', '--', patch], { stdio: 'inherit' });
  const stats = decoder.decode(execFileSync('git', ['apply', '--numstat', '-z', '--', patch]));
  const records = stats.split('\0').slice(0, -1);
  assert.ok(records.length, 'The patch must change at least one project file');
  for (const record of records) {
    const path = /^(?:\d+|-)\t(?:\d+|-)\t([^\r\n\t]+)$/.exec(record)?.[1];
    assert.ok(path && !protectedPath(path),
      'Patch touches a protected path or uses an unsupported change: ' + (path ?? record));
    assert.ok(paths.has(path), 'Patch changes a path outside the approved request scope: ' + path);
  }
  const result = spawnSync('bash', ['-e', '.forge/verify-change', patch, ...checks], { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

try {
  const change = approvedChange();
  const patch = process.argv[2];
  if (patch !== undefined) process.exitCode = verifyPatch(patch, change);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
