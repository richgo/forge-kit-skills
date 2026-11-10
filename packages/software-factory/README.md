# Forge Kit software factory

This is a native APMX factory package. APMX orders its Markdown contracts by
their file handoffs.

```text
request.md → plan.md → specification.md → changes.diff + implementation.md → review.md
```

The project owns the software stack, source, architecture, build tools, and
acceptance checks. The factory captures the project and exports checked source
changes as a Git patch. The plan, specification, and review gates require
reports. The build gate independently verifies the patch with the project's
approved checker. Human reviewers still judge the reports and approve changes.

## Prepare the project

1. Review a base revision with the source, any architecture files, and a
   Bash entry point at `.forge/verify-change`. Supply an approved `request.md`
   or use the hosted workflow's request input. Reserve the factory's output
   names at the workspace root.
2. Make the checker accept the path to the patch as its first argument. It runs
   from a fresh copy of the reviewed project and receives an unapplied patch.
   Validate the permitted change scope, apply the patch to a disposable
   candidate tree, and run the project's build, architecture, acceptance, and
   regression checks as required. Return nonzero for a rejected candidate.
3. Keep independent checks and their expected results under the reviewed
   base's control. Run candidate code in an isolated environment without
   credentials or network access. The target's checker owns that isolation
   and any runtime or toolchain provisioning. Bash and Git are factory tools
   and do not constrain the application's language.

The factory checks that the patch applies and blocks edits to its contracts,
check entry point, workflow and policy files, and reserved handoffs. The
project checker must enforce any additional scope and protect project tests
or fixtures that serve as independent evidence.

## Run and verify

From a clean staged project directory, use the immutable package revision
approved by your factory maintainer.

```sh
apmx --from "richgo/forge-kit-skills/packages/software-factory#<reviewed-sha>" --plan
apmx --from "richgo/forge-kit-skills/packages/software-factory#<reviewed-sha>" --on copilot
```

Use the pinned upstream APMX reusable workflow for hosted execution. It
rebuilds the check environment from the reviewed base, replays the producer
receipt with `apmx check`, and signs the checked outputs in a separate job.
The delivery artifact is suitable for review and can feed a project's
separately approved deployment workflow.
