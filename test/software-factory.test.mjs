import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../packages/software-factory/checks/verify-change.sh', import.meta.url));
const factory = fileURLToPath(new URL('../packages/software-factory/', import.meta.url));
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

function check(cwd, phase = 'build') {
  const args = { build: ['changes.diff'], baseline: ['--baseline'], plan: [] }[phase];
  return spawnSync(bash, [checker, ...args], {
    cwd, encoding: 'utf8',
    env: { ...process.env, PATH: process.platform === 'win32'
      ? 'C:/Program Files/Git/bin;' + process.env.PATH
      : process.env.PATH },
  });
}

const apmx = process.env.FORGE_APMX;

test('native APMX independently replays the OpenSpec and test-first gates', { skip: !apmx }, t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', candidateVerifier);
  openSpec(cwd);
  writeFileSync(join(cwd, '.forge/verify-baseline'), [
    'test "$#" -eq 1 && test "$1" = quote.correct || exit 2',
    'output="$(bash app.sh)" || exit 2',
    'test "$output" = new || exit 10',
  ].join('\n'));

  const scratch = mkdtempSync(join(tmpdir(), 'forge-apmx-replay-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
  const producer = join(scratch, 'producer');
  const verifier = join(scratch, 'verifier');
  const bundle = join(scratch, 'recorded-outputs');
  const patch = readFileSync(join(cwd, 'changes.diff'));
  rmSync(join(cwd, 'changes.diff'));
  for (const directory of [producer, verifier]) {
    cpSync(cwd, directory, { recursive: true });
    for (const name of ['contracts', 'checks']) cpSync(join(factory, name), join(directory, name), { recursive: true });
  }
  for (const [contract, files] of Object.entries({
    plan: { 'plan.md': 'Use the approved check for AC-001.\n' },
    specification: { 'specification.md': 'AC-001 links to the Correct quote scenario.\n' },
    build: { 'changes.diff': patch, 'implementation.md': 'Return the new quote.\n' },
    review: { 'review.md': 'Inspect the app.sh patch.\n' },
  })) {
    const bytes = readFileSync(join(producer, 'contracts', contract + '.contract.md'));
    const digest = createHash('sha256').update(bytes).digest('hex');
    const stage = join(bundle, digest);
    mkdirSync(stage, { recursive: true });
    for (const [name, content] of Object.entries(files)) writeFileSync(join(stage, name), content);
  }

  const env = {
    ...process.env,
    PATH: process.platform === 'win32' ? 'C:/Program Files/Git/bin;' + process.env.PATH : process.env.PATH,
  };
  const run = (cwd, args, extra = {}) => spawnSync(apmx, args, {
    cwd, encoding: 'utf8', env: { ...env, ...extra }, timeout: 90_000,
  });
  const produced = run(producer, ['./', '--on', 'replay', '--allow-host-access', '--allow-unproven-inputs'],
    { APMX_REPLAY_BUNDLE: bundle });
  assert.equal(produced.status, 0, produced.error?.message ?? produced.stdout + produced.stderr);
  const chain = join(producer, '.apm', 'chains');
  const receipt = readdirSync(chain, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(chain, entry.name, 'receipt.intoto.jsonl'))[0];
  const checked = run(verifier, ['check', receipt, './']);
  assert.equal(checked.status, 0, checked.error?.message ?? checked.stdout + checked.stderr);
  assert.match(checked.stdout, /baseline-acceptance/);
  assert.match(checked.stdout, /project-acceptance/);
  assert.match(checked.stdout, /Checked here: receipt of record/);

  writeFileSync(join(verifier, specPath), '#### Scenario: Wrong scenario\n');
  const rejected = run(verifier, ['check', receipt, './']);
  assert.notEqual(rejected.status, 0, rejected.stdout + rejected.stderr);
  assert.match(rejected.stdout + rejected.stderr, /one matching scenario/);
});

const specPath = 'openspec/changes/price-quotes/specs/quotes/spec.md';

function openSpec(cwd, acceptance = { 'AC-001': { spec: specPath, scenario: 'Correct quote' } }) {
  const root = 'openspec/changes/price-quotes';
  mkdirSync(join(cwd, root, 'specs/quotes'), { recursive: true });
  for (const [name, content] of Object.entries({
    'proposal.md': '# Price quotes\n',
    'design.md': '# Pricing design\n',
    'tasks.md': '## 1. Pricing\n- [ ] 1.1 Implement quote calculation\n',
    'specs/quotes/spec.md': [
      '## ADDED Requirements',
      '### Requirement: Accurate quotes',
      'Quotes SHALL show the correct price.',
      '#### Scenario: Correct quote',
      '- **WHEN** the customer requests a quote',
      '- **THEN** they see the correct price',
      '',
    ].join('\n'),
  })) {
    writeFileSync(join(cwd, root, name), content);
  }
  writeFileSync(join(cwd, '.forge/openspec.json'), JSON.stringify({ schema: 1, change: 'price-quotes', acceptance }));
}

test('the plan and build bind the same approved OpenSpec scenarios and bytes', t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', 'exit 0\n');
  openSpec(cwd);
  const evidence = phase => {
    const result = check(cwd, phase);
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)).openspec;
  };
  const plan = evidence('plan');
  assert.equal(plan.change, 'price-quotes');
  assert.deepEqual(plan.acceptance, { 'AC-001': { spec: specPath, scenario: 'Correct quote' } });
  const hash = path => createHash('sha256').update(readFileSync(join(cwd, path))).digest('hex');
  assert.equal(plan.files[specPath], hash(specPath));
  assert.equal(plan.files['.forge/openspec.json'], hash('.forge/openspec.json'));
  assert.equal(plan.files['openspec/changes/price-quotes/design.md'], hash('openspec/changes/price-quotes/design.md'));
  assert.deepEqual(evidence('build'), plan);
});

test('the plan rejects missing, additional or nonexistent scenario links', t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', 'exit 0\n');
  for (const [acceptance, error] of [
    [{}, /exactly the selected acceptance IDs/],
    [{ 'AC-002': { spec: specPath, scenario: 'Correct quote' } }, /exactly the selected acceptance IDs/],
    [{ 'AC-001': { spec: specPath, scenario: 'Wrong scenario' } }, /one matching scenario/],
    [{ 'AC-001': { spec: specPath.replace('specs/quotes', 'specs/../quotes'), scenario: 'Correct quote' } }, /Invalid OpenSpec delta path/],
  ]) {
    openSpec(cwd, acceptance);
    const result = check(cwd, 'plan');
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
  }
});

test('scenario links reject headings inside fenced code blocks', t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', 'exit 0\n');
  openSpec(cwd);
  writeFileSync(join(cwd, specPath), '~~~md\n#### Scenario: Correct quote\n~~~\n');
  const result = check(cwd, 'plan');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /one matching scenario/);
});

test('the request cannot authorize changing OpenSpec or its installed agent instructions', t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', 'exit 0\n');
  for (const path of [specPath, '.agents/skills/openspec-propose/SKILL.md']) {
    writeFileSync(join(cwd, 'request.md'), requestFor('STORY-001', path));
    const result = check(cwd, 'plan');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /protected source path/);
  }
});

const candidateVerifier = [
  'test "$2" = quote.correct',
  'git apply -- "$1"',
  'test "$(bash app.sh)" = new',
].join('\n');

test('independent replay records a behavior failure on the base and success on the candidate', t => {
  const { cwd } = fixture(t, 'app.sh', 'echo old\n', 'echo new\n', candidateVerifier);
  const baseline = [
    'test "$#" -eq 1 && test "$1" = quote.correct || exit 2',
    'output="$(bash app.sh)" || exit 2',
    'test "$output" = new || exit 10',
  ].join('\n');
  writeFileSync(join(cwd, '.forge/verify-baseline'), baseline);
  const results = ['baseline', 'build'].map(phase => {
    const result = check(cwd, phase);
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)).testFirst;
  });
  assert.deepEqual(results[0].baseline, [{ check: 'quote.correct', status: 'behavior-missing' }]);
  assert.equal(results[0].baselineVerifierSha256, createHash('sha256').update(baseline).digest('hex'));
  assert.equal(results[1].candidate, 'passed');
  assert.equal(results[1].baseline, undefined);
});

test('test-first verification rejects green or broken baselines and missing behavior in the candidate', t => {
  for (const [phase, baseline, candidate, error] of [
    ['baseline', 'exit 0\n', 'echo new\n', /unexpectedly passed/],
    ['baseline', 'exit 2\n', 'echo new\n', /did not report an expected behavior failure/],
    ['build', 'exit 10\n', 'echo wrong\n', /candidate acceptance checks failed/],
  ]) {
    const { cwd } = fixture(t, 'app.sh', 'echo old\n', candidate, candidateVerifier);
    writeFileSync(join(cwd, '.forge/verify-baseline'), baseline);
    const result = check(cwd, phase);
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
  }
});

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
