import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../packages/software-factory/checks/verify-change.sh', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

function fixture(t, source, before, after, verification) {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-apmx-check-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.forge'));
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd });
  writeFileSync(join(cwd, source), before);
  writeFileSync(join(cwd, '.forge', 'verify-change'), verification);
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
  });
}

test('the same factory check delegates to projects using different languages', t => {
  for (const [path, before, after, command] of [
    ['app.sh', 'echo old\n', 'echo new\n', 'bash app.sh'],
    ['app.cjs', 'console.log("old");\n', 'console.log("new");\n', 'node app.cjs'],
  ]) {
    const { cwd } = fixture(t, path, before, after, [
      'git apply -- "$1"',
      `test "$(${command})" = new`,
    ].join('\n'));
    const result = check(cwd);
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
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
