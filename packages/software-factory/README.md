# Forge Kit software factory

This is a native APMX factory package. APMX orders its Markdown contracts by
their file handoffs.

```text
specs/product-requirements.md + request.md → plan.md → specification.md → changes.diff + implementation.md → review.md
```

The project owns the software stack, source, architecture, build tools, and
acceptance checks. The factory captures the project and exports checked source
changes as a Git patch. The plan gate validates the approved story selection.
The build gate independently checks the patch and invokes the project's
approved checker for the selected acceptance criteria. Human reviewers
judge the reports and approve changes.

## Prepare the project

1. Review a base revision with the source, any architecture files,
   `specs/product-requirements.md`, `request.md` and `.forge/verify-change`. Use the
   [requirements template](../requirements/templates/product-requirements.md)
   to author stories, architecture owners and Given/When/Then criteria with
   stable check IDs. Reserve the factory output names at the workspace root.
2. Start `request.md` with `# Approved change request`. Under `## Stories`,
   list one backtick-quoted story ID per Markdown bullet. Under
   `## Allowed source paths`, list one backtick-quoted exact project-relative
   path per bullet. Use optional `## Constraints` for implementation constraints.
3. Make the checker accept the path to the patch as its first argument, followed
   by the distinct acceptance check IDs for the requested stories. It runs
   from a fresh copy of the reviewed project and receives an unapplied patch.
   Validate the permitted change scope, apply the patch to a disposable
   candidate tree, run every requested check, and run the project's build,
   architecture and regression checks as required. Return nonzero for an
   unrecognized check ID or a rejected candidate.
4. Keep independent checks and their expected results under the reviewed
   base's control. Run candidate code in an isolated environment without
   credentials or network access. The target's checker owns that isolation
   and any runtime or toolchain provisioning. Bash, Git and Node.js are factory tools
   and do not constrain the application's language.

The factory checks that the patch applies, confines edits to the exact
approved paths and blocks edits to its contracts, approved requirements and
request, check entry point, workflow and policy files, and reserved handoffs. The
project checker must enforce any additional scope and protect project tests
or fixtures that serve as independent evidence.

### OpenSpec and test-first verification

Use OpenSpec 2.x to validate the reviewed change before invoking APMX. Commit
the change artifacts and a binding in `.forge/openspec.json`. The existing
request and product requirements select the stories and their check IDs.
The binding links each selected acceptance ID to one scenario title in an
ADDED or MODIFIED requirement.

```json
{
  "schema": 1,
  "change": "report-readiness",
  "acceptance": {
    "AC-001": {
      "spec": "openspec/changes/report-readiness/specs/readiness/spec.md",
      "scenario": "Report readiness"
    },
    "AC-002": {
      "spec": "openspec/changes/report-readiness/specs/readiness/spec.md",
      "scenario": "Signal successful completion"
    }
  }
}
```

The package checks the binding against the reviewed `proposal.md`, `tasks.md`
and referenced deltas. Both the plan and build checks report SHA-256 digests
of the binding and change directory, including `design.md` when present.
Updates to reviewed OpenSpec inputs go through a separate reviewed change.

To verify a new behavior or a repair test-first, commit an independent
`.forge/verify-baseline` alongside the candidate checker. APMX runs it on
an isolated copy of the base before starting implementation. The script
receives one selected check ID per invocation. It exits with code 10 only
after observing the expected missing behavior. Treat unexpected errors,
unsupported IDs and missing prerequisites as failures distinct from code 10.
Use the same reviewed assertion in `.forge/verify-change` and require it to
pass on the candidate. This path fits changes for which every selected
check should fail on the base. Keep passing regression checks in the
candidate verifier. The baseline and candidate observations are emitted
by different native contract checks and rerun during independent replay.

## Run and verify

From a clean staged project directory, use the immutable package revision
approved by your factory maintainer.

```sh
apmx --from "richgo/forge-kit-skills/packages/software-factory#<reviewed-sha>" --plan
apmx --from "richgo/forge-kit-skills/packages/software-factory#<reviewed-sha>" --on copilot
```

Use the pinned upstream APMX reusable workflow for hosted execution. Omit its
request override so both hosted jobs read the checked-in request. It
rebuilds the check environment from the reviewed base, replays the producer
receipt with `apmx check`, and signs the checked outputs in a separate job.
The delivery artifact is suitable for review and can feed a project's
separately approved deployment workflow.

APMX stages checker resources from the selected package. When changing the
Markdown compiler, refresh `checks/markdown-requirements.mjs` from the
requirements package. The software factory tests verify the copies match.
