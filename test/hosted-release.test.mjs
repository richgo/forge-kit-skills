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

test('production recovery authenticates and observes the prior release before publishing', () => {
  const pages = workflow.split('\n  pages:\n')[1];
  const prepare = pages.indexOf('gh attestation verify previous/archive/artifact.tar');
  const liveProbe = pages.indexOf('previous/release.json > proof/previous-observation.json');
  const upload = pages.indexOf('name: factory-pages-rollback');
  const publish = pages.indexOf('- id: publish');
  assert.ok(prepare >= 0 && prepare < liveProbe && liveProbe < upload && upload < publish);
  assert.match(pages, /--source-ref refs\/heads\/main --source-digest "\$prior_sha"/);
  assert.match(pages, /\.path == "\.github\/workflows\/factory-e2e\.yml"/);
  assert.match(pages, /\[\[ "\$NO_ROLLBACK_OVERRIDE" == true \]\]/);
});

test('failed deployment or observation triggers one restoration and records its real probe', () => {
  const pages = workflow.split('\n  pages:\n')[1];
  assert.equal(pages.match(/artifact_name: factory-pages-rollback/g)?.length, 1);
  assert.match(pages, /if: \$\{\{ failure\(\) && steps\.previous\.outputs\.prepared == 'true' && \(steps\.publish\.outcome == 'failure' \|\| steps\.observe\.outcome == 'failure'\) \}\}/);
  assert.match(pages, /steps\.restore\.outcome == 'success'/);
  assert.match(pages, /node factory\/website\.mjs probe "\$PAGE_URL" previous\/release\.json > proof\/rollback-observation\.json/);
  assert.match(pages, /name: factory-pages-recovery/);
});

test('website scope is independently reproduced and security evidence is required before signing', () => {
  const producer = workflow.split('\n  build:\n')[1].split('\n  contract:\n')[0];
  const verifier = workflow.split('\n  verify:\n')[1].split('\n  attest:\n')[0];
  const signer = workflow.split('\n  attest:\n')[1].split('\n  authenticate:\n')[0];
  assert.ok(producer.indexOf('bash factory/plan-release.sh') < producer.indexOf('node factory/website.mjs build'));
  assert.match(verifier, /cmp "\$RUNNER_TEMP\/independent-plan\.json" out\/impact-plan\.json/);
  assert.match(verifier, /Restore the audited capability bytes/);
  assert.match(signer, /securityVerification: \$security/);
  assert.match(signer, /impactPlan: \$plan/);
});

test('producer and verifier execute from the same audited APM restore', () => {
  const assembly = workflow.split('\n  assemble:\n')[1].split('\n  build:\n')[0];
  assert.match(assembly, /archive="\$RUNNER_TEMP\/apm_modules\.tar"/);
  assert.match(assembly, /-cf "\$archive" -C "\$scratch\/project" apm_modules/);
  assert.match(assembly, /name: factory-apm-modules/);
  for (const [job, next] of [['build', 'contract'], ['verify', 'attest']]) {
    const section = workflow.split('\n  ' + job + ':\n')[1].split('\n  ' + next + ':\n')[0];
    assert.match(section, /name: factory-apm-modules/);
    assert.match(section, /sha256sum --check/);
    assert.match(section, /archive="\$RUNNER_TEMP\/apm-restore\/apm_modules\.tar"/);
    assert.match(section, /tar --no-same-owner -xf "\$archive"/);
  }
  assert.match(workflow, /apmModules: \$modules/);
});
