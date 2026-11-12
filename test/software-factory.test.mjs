import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../packages/software-factory/checks/verify-change.sh', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const requirements = [
  '# Product requirements',
  '## Epic EPIC-001 — Deliver quotes',
  'Outcome: Customers see accurate prices.',
  '### Feature FEAT-001 — Pricing',
  'Outcome: Customers see the price of their order.',
  '#### Story STORY-001 — Update quote',
  'Architecture owner: `pricing`',
  '',
  'As a customer, I want an accurate quote.',
  '##### Acceptance AC-001 — Correct quote',
  '- Given a quote request',
  '- When the quote is calculated',
  '- Then the customer sees the correct price',
  '- Check: `quote.correct`',
  '#### Story STORY-002 — Keep past quotes',
  'Architecture owner: `pricing`',
  '',
  'As a customer, I want to see old quotes.',
  '##### Acceptance AC-002 — See a past quote',
  '- Given a previous quote',
  '- When the customer requests it',
  '- Then the customer sees the saved price',
  '- Check: `quote.history`',
  '',
].join('\n');

const requestFor = (story, path) => [
  '# Approved change request',
  '## Stories',
  '- `' + story + '`',
  '## Allowed source paths',
  '- `' + path + '`',
  '',
].join('\n');

function fixture(t, source, before, after, verification) {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-apmx-check-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.forge'));
  mkdirSync(join(cwd, 'specs'));
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd });
  writeFileSync(join(cwd, source), before);
  writeFileSync(join(cwd, '.forge', 'verify-change'), verification);
  writeFileSync(join(cwd, 'specs/product-requirements.md'), requirements);
  writeFileSync(join(cwd, 'request.md'), requestFor('STORY-001', source));
  git('init', '-q');
  git('add', '.');
  writeFileSync(join(cwd, source), after);
  const patch = git('diff', '--full-index', '--no-renames');
  writeFileSync(join(cwd, source), before);
  writeFileSync(join(cwd, 'changes.diff'), patch);
  return { cwd, git };
}

function check(cwd) {
  return spawnSync(bash, [checker, 'changes.diff'], {
    cwd, encoding: 'utf8',
    env: { ...process.env, PATH: process.platform === 'win32'
      ? 'C:/Program Files/Git/bin;' + process.env.PATH
      : process.env.PATH },
  });
}

test('standalone APMX packages carry the same Markdown compiler', () => {
  const compiler = 'checks/markdown-requirements.mjs';
  assert.deepEqual(
    readFileSync(new URL('../packages/software-factory/' + compiler, import.meta.url)),
    readFileSync(new URL('../packages/requirements/' + compiler, import.meta.url)),
  );
});

test('the same factory check delegates to projects using different languages', t => {
  for (const [path, before, after, command] of [
    ['app.sh', 'echo old\n', 'echo new\n', 'bash app.sh'],
    ['app.cjs', 'console.log("old");\n', 'console.log("new");\n', 'node app.cjs'],
  ]) {
    const { cwd } = fixture(t, path, before, after, [
      'test "$#" -eq 2',
      'test "$2" = quote.correct',
      'git apply -- "$1"',
      `test "$(${command})" = new`,
    ].join('\n'));
    const result = check(cwd);
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    const evidence = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    const hash = file => createHash('sha256').update(readFileSync(join(cwd, file))).digest('hex');
    assert.deepEqual(evidence.stories, ['STORY-001']);
    assert.deepEqual(evidence.acceptanceIds, ['AC-001']);
    assert.deepEqual(evidence.checks, ['quote.correct']);
    assert.equal(evidence.sourceSha256, hash('specs/product-requirements.md'));
    assert.equal(evidence.requestSha256, hash('request.md'));
    assert.match(evidence.normalizedSha256, /^[a-f0-9]{64}$/);
  }
});

test('unrecognized stories fail before the project verifier runs', t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', 'exit 0\n');
  writeFileSync(join(cwd, 'request.md'), requestFor('STORY-999', 'app.sh'));
  const result = check(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown selected story STORY-999/);
});

test('malformed requirements fail before the project verifier runs', t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', 'exit 0\n');
  writeFileSync(join(cwd, 'specs/product-requirements.md'), '# Product requirements\n');
  assert.equal(check(cwd).status, 1);
});

test('request scope rejects even a source patch the project verifier would accept', t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', 'exit 0\n');
  writeFileSync(join(cwd, 'request.md'), requestFor('STORY-001', 'different.sh'));
  const result = check(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside the approved request scope: app\.sh/);
});

test('a patch cannot replace approved requirements or request', t => {
  const { cwd, git } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', 'exit 0\n');
  for (const name of ['specs/product-requirements.md', 'request.md']) {
    const content = name === 'specs/product-requirements.md' ? requirements : requestFor('STORY-001', 'app.sh');
    writeFileSync(join(cwd, name), content + '\n');
    writeFileSync(join(cwd, 'changes.diff'), git('diff', '--full-index', '--no-renames'));
    writeFileSync(join(cwd, name), content);
    const result = check(cwd);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /protected path/);
  }
});

test('project acceptance failure rejects a valid patch', t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo wrong\n', [
    'git apply -- "$1"',
    'test "$(bash app.sh)" = new',
  ].join('\n'));
  assert.equal(check(cwd).status, 1);
});

test('a patch cannot replace the project verifier', t => {
  const { cwd, git } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', 'exit 0\n');
  const verifier = join(cwd, '.forge', 'verify-change');
  writeFileSync(verifier, 'echo compromised\n');
  writeFileSync(join(cwd, 'changes.diff'), git('diff', '--full-index', '--no-renames'));
  writeFileSync(verifier, 'exit 0\n');
  const result = check(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protected path/);
});
