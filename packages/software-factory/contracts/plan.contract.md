---
needs:
  - request.md
  - specs/product-requirements.md
produces: plan.md
verify:
  approved-request: bash checks/verify-change.sh
  baseline-acceptance: bash checks/verify-change.sh --baseline
  plan-present: test -s plan.md
---

Read the approved request.md and locate each selected story in
specs/product-requirements.md. Plan the requested change within the approved
source paths. Read the captured project's existing
source, architecture, build instructions, and tests. Identify affected
components and consumers, the behavior that must stay compatible, the tests
that prove it, and migration or recovery risks. Follow the project's existing
languages, tools, and conventions. Trace the plan to the selected story,
architecture owner, acceptance criteria and check IDs. Flag conflicts
between the approved inputs for review.

When the captured project includes .forge/openspec.json, read the named
OpenSpec change, its acceptance scenario links and design when present.
Trace the selected acceptance check IDs to those scenarios. When
.forge/verify-baseline is present, the independent plan gate runs the
reviewed checks against the base before implementation.

Write only plan.md. Use the available file tools.
