import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';

const bindingPath = '.forge/openspec.json';
const decoder = new TextDecoder('utf-8', { fatal: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function objectWithKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function readChangeFiles(directory, files = new Map()) {
  assert.ok(lstatSync(directory).isDirectory(), 'Expected a regular OpenSpec directory: ' + directory);
  for (const name of readdirSync(directory).sort()) {
    const path = directory + '/' + name;
    const entry = lstatSync(path);
    if (entry.isDirectory()) {
      readChangeFiles(path, files);
    } else {
      assert.ok(entry.isFile(), 'Expected a regular OpenSpec file: ' + path);
      files.set(path, readFileSync(path));
    }
  }
  return files;
}

function scenarioNames(bytes) {
  const names = [];
  let fence;
  let sectionAllowsScenarios = false;
  let insideRequirement = false;
  for (const line of decoder.decode(bytes).split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = undefined;
      }
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    const heading = /^ {0,3}(#{1,4})[ \t]+(.+)$/.exec(line);
    if (!heading) continue;
    const level = heading[1].length;
    const title = heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
    if (level <= 2) {
      sectionAllowsScenarios = level === 2 && /^(?:ADDED|MODIFIED) Requirements$/.test(title);
      insideRequirement = false;
    } else if (level === 3) {
      insideRequirement = sectionAllowsScenarios && /^Requirement:\s*\S/i.test(title);
    } else if (insideRequirement) {
      const name = /^Scenario:\s*(\S.*)$/i.exec(title)?.[1];
      if (name) names.push(name);
    }
  }
  return names;
}

export function readOpenSpecEvidence(acceptanceIds) {
  const binding = lstatSync(bindingPath, { throwIfNoEntry: false });
  if (!binding) return undefined;
  assert.ok(lstatSync('.forge').isDirectory() && binding.isFile(), 'Expected a regular OpenSpec binding');
  const bytes = readFileSync(bindingPath);
  const config = JSON.parse(decoder.decode(bytes));
  assert.ok(objectWithKeys(config, ['schema', 'change', 'acceptance']) && config.schema === 1
    && typeof config.change === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.change),
  'Invalid OpenSpec binding schema or change ID');
  assert.ok(objectWithKeys(config.acceptance, acceptanceIds), 'OpenSpec must bind exactly the selected acceptance IDs');

  for (const directory of ['openspec', 'openspec/changes']) {
    assert.ok(lstatSync(directory).isDirectory(), 'Expected a regular OpenSpec directory: ' + directory);
  }
  const directory = 'openspec/changes/' + config.change;
  const files = readChangeFiles(directory);
  for (const name of ['proposal.md', 'tasks.md']) {
    assert.ok(files.get(directory + '/' + name)?.length, 'Missing reviewed OpenSpec artifact: ' + name);
  }
  const deltaRoot = directory + '/specs/';
  const scenarios = new Map();
  const acceptance = {};
  for (const id of acceptanceIds) {
    const link = config.acceptance[id];
    assert.ok(objectWithKeys(link, ['spec', 'scenario']) && typeof link.spec === 'string'
      && typeof link.scenario === 'string' && link.scenario && link.scenario === link.scenario.trim(),
    'Invalid OpenSpec acceptance link: ' + id);
    const { spec, scenario } = link;
    assert.ok(spec.startsWith(deltaRoot) && /\/[^/]+\/spec\.md$/.test(spec.slice(deltaRoot.length - 1))
      && files.has(spec), 'Invalid OpenSpec delta path: ' + spec);
    if (!scenarios.has(spec)) scenarios.set(spec, scenarioNames(files.get(spec)));
    assert.equal(scenarios.get(spec).filter(name => name === scenario).length, 1,
      'OpenSpec acceptance must link to one matching scenario: ' + id);
    acceptance[id] = { spec, scenario };
  }

  return {
    schema: 1,
    change: config.change,
    acceptance,
    files: Object.fromEntries([[bindingPath, sha256(bytes)], ...[...files].map(([path, content]) => [path, sha256(content)])]),
  };
}
