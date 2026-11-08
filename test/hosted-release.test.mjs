import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/forge-factory-worker.yml', import.meta.url), 'utf8');
const exported = await readFile(new URL('../packages/factory-workflows/workflows/forge-factory-worker.yml', import.meta.url), 'utf8');

test('worker publishes the same Pages tar that the independent verifier sends to the attestor', () => {
  const verifier = workflow.split('\n  verify:\n')[1].split('\n  attest:\n')[0];
  const attestor = workflow.split('\n  attest:\n')[1].split('\n  authenticate:\n')[0];
  assert.match(verifier, /tar -cf pages-archive\/artifact\.tar -C release/);
  assert.match(verifier, /name: factory-pages\s+path: pages-archive\/artifact\.tar/);
  assert.match(attestor, /name: factory-pages\s+path: archive/);
  assert.match(attestor, /subject-path: archive\/artifact\.tar/);
});

test('deployer requires the trusted worker attestation before opening or deploying the archive', () => {
  const [deployer, pages] = workflow.split('\n  authenticate:\n')[1].split('\n  pages:\n');
  const verification = deployer.indexOf('gh attestation verify archive/artifact.tar');
  assert.ok(verification >= 0, 'Pages deployment must cryptographically verify its input');
  assert.match(deployer, /--signer-workflow richgo\/forge-kit-skills\/\.github\/workflows\/forge-factory-worker\.yml/);
  assert.match(deployer, /--source-digest "\$GITHUB_SHA"/);
  assert.ok(verification < deployer.indexOf('tar -xOf archive/artifact.tar'));
  assert.match(pages, /needs: authenticate/);
  assert.match(pages, /actions\/deploy-pages@/);
});

test('frozen APM installation gates build and its lock is bound into the signed release evidence', () => {
  assert.match(workflow, /install --target copilot --frozen/);
  assert.match(workflow, /\n  build:\n[^]*?\n    needs: assemble/);
  assert.match(workflow, /apmLock: \$lock/);
  assert.equal(workflow, exported, 'GitHub worker and APM export must agree');
});

test('website and readiness releases take distinct packaging paths', () => {
  assert.match(workflow, /if: github.event.inputs.publish_pages == 'true' && github.event.inputs.website_release == ''\s+run: node factory\/pages.mjs package/);
  assert.match(workflow, /if: github.event.inputs.website_release != ''\s+run: node factory\/website.mjs package/);
});

test('attestation verification pins the reviewed workflow revision and compares trusted evidence hashes', () => {
  const gate = workflow.split('\n  authenticate:\n')[1].split('\n  pages:\n')[0];
  assert.match(gate, /--signer-digest "\$signer" --source-ref "\$GITHUB_REF"/);
  assert.match(gate, /--bundle "\${bundles\[0\]}"/);
  assert.match(gate, /hash apm\.lock\.yaml/);
  assert.match(gate, /hash verified\/receipt\.intoto\.jsonl/);
  assert.match(gate, /hash verified\/requirements-verification\.json/);
  assert.match(gate, /any\(\.\[\]\.verificationResult\.statement\.predicate/);
});
