# Forge Kit software factory

This is a native APMX factory package. APMX orders its Markdown contracts by
their file handoffs.

```text
product-requirements.md + request.md → plan.md → specification.md → changes.diff + implementation.md → review.md
```

The project owns the software stack, source, architecture, build tools, and
acceptance checks. The factory captures the project and exports checked source
changes as a Git patch. The plan gate validates the approved story selection.
The build gate independently checks the patch and invokes the project's
approved checker for the selected acceptance criteria. Human reviewers
judge the reports and approve changes.

## Prepare the project

1. Review a base revision with the source, any architecture files,
   `product-requirements.md`, `request.md` and `.forge/verify-change`. Use the
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
