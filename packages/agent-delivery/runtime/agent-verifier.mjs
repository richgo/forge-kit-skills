import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

// Docker Official Images OCI indexes. Pull the exact image before qualification.
export const runtimeImages = Object.freeze({
  node: 'docker.io/library/node@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d',
  python: 'docker.io/library/python@sha256:a5a7017efc5969e00ae2b91c8eb0631049a569652aa4ffc4501769049ae45c72',
});

const commands = {
  node: { entrypoint: '/usr/local/bin/node', args: [] },
  python: { entrypoint: '/usr/local/bin/python', args: ['-B', '-E', '-s'] },
};
const byteLimit = 64 * 1024;
const sourceLimit = 128 * 1024;
const pathPattern = /^src\/(?:[A-Za-z0-9_][A-Za-z0-9_-]*\/)*[A-Za-z0-9_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9]+)+$/;
const deviceName = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i;

function validPath(path) {
  return typeof path === 'string' && path.length <= 160 && pathPattern.test(path) &&
    !path.split('/').some(part => deviceName.test(part));
}

export function validateCandidate({ runtime, entry, files }, candidate) {
  assert.ok(Object.hasOwn(runtimeImages, runtime), 'Unsupported candidate runtime');
  assert.ok(Array.isArray(files) && files.length > 0 && files.length <= 32 && files.every(validPath),
    'Invalid declared source paths');
  assert.equal(new Set(files.map(path => path.toLowerCase())).size, files.length, 'Duplicate source paths');
  assert.ok(files.includes(entry), 'Entry path must be declared source');
  assert.ok(candidate && typeof candidate === 'object' && !Array.isArray(candidate), 'Candidate source map required');
  const paths = Object.keys(candidate);
  assert.ok(paths.length === files.length && files.every(path => Object.hasOwn(candidate, path)),
    'Candidate source must exactly match declared paths');

  let size = 0;
  for (const path of files) {
    const source = candidate[path];
    assert.equal(typeof source, 'string', 'Candidate source must be text');
    assert.equal(Buffer.from(source, 'utf8').toString('utf8'), source, 'Candidate source must be valid UTF-8');
    size += Buffer.byteLength(source);
    assert.ok(size <= sourceLimit, 'Candidate source exceeds size limit');
  }
}

function inputLine(input) {
  const json = JSON.stringify(input);
  assert.ok(json !== undefined && Buffer.byteLength(json) < byteLimit, 'Invalid or oversized acceptance input');
  return json + '\n';
}

function invokeDocker(config, args, input = '') {
  const allowed = ['path', 'systemroot', 'home', 'userprofile', 'xdg_runtime_dir',
    'docker_host'];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.includes(key.toLowerCase())));
  return new Promise((resolve, reject) => {
    const child = execFile('docker', ['--config', config, ...args], {
      env, encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL', maxBuffer: byteLimit,
    }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(new Error('Container command failed'), { stderr }));
      else resolve(stdout);
    });
    // A rejected or early-exiting program may close its input before it is read.
    child.stdin?.on('error', () => {});
    child.stdin?.end(input);
  });
}

export async function runInContainer({ runtime, entry, candidate, input }) {
  validateCandidate({ runtime, entry, files: Object.keys(candidate) }, candidate);
  const inputBytes = inputLine(input);
  const scratch = await mkdtemp(join(tmpdir(), 'forge-agent-source-'));
  const source = join(scratch, 'workspace');
  // Docker can inject proxy credentials from its configuration. Give the
  // client an empty config directory and mount only the source tree.
  const config = join(scratch, 'docker-config');
  const name = 'forge-candidate-' + randomUUID();
  try {
    await mkdir(config, { mode: 0o700 });
    await mkdir(source);
    await chmod(source, 0o755);
    for (const [path, content] of Object.entries(candidate)) {
      const file = join(source, path);
      await mkdir(dirname(file), { recursive: true, mode: 0o755 });
      await writeFile(file, content, { flag: 'wx', mode: 0o644 });
    }
    const command = commands[runtime];
    // Docker parses --mount as CSV. Quote the field so a temp directory with
    // a comma or quote stays a single host path.
    const mount = 'type=bind,"source=' + source.replaceAll('"', '""') + '",target=/work,readonly,bind-recursive=disabled';
    await invokeDocker(config, [
      'create', '-i', '--name', name, '--pull=never', '--network=none', '--ipc=none',
      '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--user=65534:65534', '--memory=192m', '--memory-swap=192m', '--cpus=1',
      '--pids-limit=64', '--log-driver=none', '--workdir=/work', '--mount', mount,
      '--entrypoint', command.entrypoint, runtimeImages[runtime], ...command.args, '/work/' + entry,
    ]);
    return await invokeDocker(config, ['start', '-a', '-i', name], inputBytes);
  } finally {
    // Killing an attached client on timeout or overflow does not kill the
    // container. Always remove it explicitly, including after failed creation.
    try {
      await invokeDocker(config, ['rm', '-f', name]);
    } catch (error) {
      if (!/No such container/i.test(error.stderr ?? '')) throw new Error('Container cleanup failed', { cause: error });
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
}

export async function verifyCandidate(product, cases, candidate, run = runInContainer) {
  validateCandidate(product, candidate);
  assert.ok(Array.isArray(cases) && cases.length > 0 && cases.length <= 64, 'Acceptance cases required');
  const ids = new Set();
  for (const item of cases) {
    assert.ok(item && typeof item.id === 'string' && item.id && !ids.has(item.id) &&
      typeof item.story === 'string' && item.story && Object.hasOwn(item, 'expected'), 'Invalid acceptance case');
    inputLine(item.input);
    ids.add(item.id);
  }
  const checks = [];
  for (const { id, story, input, expected } of cases) {
    let stdout;
    try {
      stdout = await run({ runtime: product.runtime, entry: product.entry, candidate, input });
    } catch {
      checks.push({ id, story, passed: false, reason: 'execution-failed' });
      continue;
    }
    let observed;
    try {
      assert.ok(typeof stdout === 'string' && Buffer.byteLength(stdout) <= byteLimit);
      observed = JSON.parse(stdout);
    } catch {
      checks.push({ id, story, passed: false, reason: 'invalid-output' });
      continue;
    }
    const passed = isDeepStrictEqual(observed, expected);
    checks.push(passed ? { id, story, passed } : { id, story, passed, reason: 'unexpected-output' });
  }
  return { passed: checks.every(check => check.passed), checks };
}

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sortedSource = source => Object.fromEntries(Object.keys(source).sort().map(path => [path, source[path]]));

export async function exerciseRecovery({ initial, next }, run = runInContainer) {
  validateCandidate(initial.product, initial.candidate);
  validateCandidate(next.product, next.candidate);
  assert.equal(initial.product.id, next.product.id, 'Recovery requires revisions of one product');
  assert.notDeepEqual(initial.candidate, next.candidate, 'Evolution must change candidate source');

  const directory = await mkdtemp(join(tmpdir(), 'forge-agent-drill-'));
  const events = [];
  const releaseFile = release => join(directory, release + '.json');
  const active = join(directory, 'active');
  const stage = async snapshot => {
    const bytes = JSON.stringify({ ...snapshot, candidate: sortedSource(snapshot.candidate) });
    const release = digest(bytes);
    await writeFile(releaseFile(release), bytes, { flag: 'wx' });
    return release;
  };
  const check = async (release, phase, expected = true) => {
    assert.match(release, /^[a-f0-9]{64}$/);
    const bytes = await readFile(releaseFile(release));
    assert.equal(digest(bytes), release, 'Isolated release digest mismatch');
    const { product, cases, candidate } = JSON.parse(bytes);
    const result = await verifyCandidate(product, cases, candidate, run);
    events.push({ phase, release, ...result });
    const faultObserved = result.checks.every(item => item.reason === 'invalid-output');
    if (result.passed !== expected || (!expected && !faultObserved)) {
      throw Object.assign(new Error('Unexpected isolated release result at ' + phase), { evidence: { passed: false, events } });
    }
  };
  const activate = async (release, phase, expected) => {
    const update = active + '.next';
    await writeFile(update, release, { flag: 'wx' });
    await rename(update, active);
    await check(await readFile(active, 'utf8'), phase, expected);
  };
  try {
    const baseline = await stage(initial);
    await check(baseline, 'verify-initial');
    await activate(baseline, 'observe-initial');
    const candidate = await stage(next);
    await check(candidate, 'verify-next');
    await activate(candidate, 'observe-next');

    const { runtime, entry } = next.product;
    const failure = runtime === 'node'
      ? "process.stdin.resume(); process.stdin.on('end', () => console.log('forge-injected-fault'));\n"
      : "import sys\nsys.stdin.read()\nprint('forge-injected-fault')\n";
    const injected = await stage({ ...next, candidate: { ...next.candidate, [entry]: failure } });
    const predecessor = await readFile(active, 'utf8');
    assert.equal(predecessor, candidate, 'Active release changed after successful observation');
    await activate(injected, 'observe-injected', false);
    await activate(predecessor, 'observe-restored');
    return { passed: true, events, restoredRelease: predecessor };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
