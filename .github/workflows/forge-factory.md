---
name: Forge Factory Orchestrator
description: Start one independently checked Forge Kit factory run.
on:
  workflow_call:
    secrets:
      COPILOT_GITHUB_TOKEN:
        required: true
      FORGE_JEV_TOKEN:
        required: false
permissions:
  contents: read
engine: copilot
inlined-imports: true
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
  call-workflow:
    workflows: [forge-factory-worker]
    max: 1
timeout-minutes: 10
max-turns: 4
jobs:
  require-factory:
    needs: [call-forge-factory-worker, detection]
    if: always()
    runs-on: ubuntu-24.04
    permissions: {}
    timeout-minutes: 2
    steps:
      - name: Require a successful factory worker
        env:
          WORKER_RESULT: ${{ needs.call-forge-factory-worker.result }}
        run: test "$WORKER_RESULT" = success
---

# Run the Forge Kit factory

Call the `forge_factory_worker` safe-output tool exactly once, with no arguments.
The worker reads the original GitHub dispatch inputs and owns validation,
building, bounded repair, independent acceptance, and deployment. The agent
has no release credentials and cannot change the requested story, build
inputs, or promotion policy. Do not substitute a summary for the tool call.
