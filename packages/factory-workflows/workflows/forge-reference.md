---
description: Rehearse the Forge Kit lifecycle and review the resulting evidence.
on:
  workflow_call:
    secrets:
      COPILOT_GITHUB_TOKEN:
        required: true
permissions:
  contents: read
engine: copilot
imports:
  - shared/forge-github-read.md
network:
  allowed: [defaults]
safe-outputs:
  activation-comments: false
  create-issue: false
  report-missing-tool: false
  report-missing-data: false
  report-incomplete: false
  report-failure-as-issue: false
  report-failed-jobs: false
  threat-detection:
    report-as-issue: false
  noop:
    max: 1
    report-as-issue: false
timeout-minutes: 10
max-turns: 4
jobs:
  produce:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - name: Validate the immutable catalog ref
        env:
          CATALOG_REF: ${{ job.workflow_sha }}
        run: |
          [[ "$CATALOG_REF" =~ ^[0-9a-f]{40}$ ]]
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          repository: ${{ job.workflow_repository }}
          ref: ${{ job.workflow_sha }}
          persist-credentials: false
      - run: node packages/factory-workflows/runtime/cli.mjs build out
      - uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f
        with:
          name: forge-candidate
          path: out/candidate.json
          if-no-files-found: error
  check:
    needs: produce
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    permissions:
      contents: read
    outputs:
      public_key: ${{ steps.sign.outputs.public_key }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          repository: ${{ job.workflow_repository }}
          ref: ${{ job.workflow_sha }}
          persist-credentials: false
      - uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131
        with:
          name: forge-candidate
          path: out
      - id: sign
        run: |
          public_key="$(node packages/factory-workflows/runtime/cli.mjs check out)"
          printf 'public_key=%s\n' "$public_key" >> "$GITHUB_OUTPUT"
      - uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f
        with:
          name: forge-acceptance
          path: out/receipt.dsse.json
          if-no-files-found: error
  deliver:
    needs: [produce, check]
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    permissions:
      contents: read
    outputs:
      evidence: ${{ steps.report.outputs.evidence }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          repository: ${{ job.workflow_repository }}
          ref: ${{ job.workflow_sha }}
          persist-credentials: false
      - uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131
        with:
          name: forge-candidate
          path: out
      - uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131
        with:
          name: forge-acceptance
          path: out
      - env:
          FORGE_CHECKER_PUBLIC_KEY: ${{ needs.check.outputs.public_key }}
        run: node packages/factory-workflows/runtime/cli.mjs deliver out
      - run: node packages/factory-workflows/runtime/cli.mjs rehearse out/repair --fail-first-observation
      - id: report
        run: |
          digest="$(jq -er '.id' out/observation.json)"
          [[ "$digest" =~ ^[0-9a-f]{64}$ ]]
          printf 'evidence=%s\n' "$digest" >> "$GITHUB_OUTPUT"
      - uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f
        with:
          name: forge-observations
          path: |
            out/observation.json
            out/repair/lifecycle.json
          if-no-files-found: error
---

# Review the reference run

The workflow's deterministic jobs build a data-only candidate, independently check and sign it, verify the receipt before local promotion, and exercise rollback and one repair in a separate isolated rehearsal.

The independently checked deployment digest is ${{ needs.deliver.outputs.evidence }}.
Use the noop tool to summarize the run outcome and the limits of the fixture evidence. Do not edit files, deploy to shared environments, or approve release.
