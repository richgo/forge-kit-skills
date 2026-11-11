---
needs:
  - request.md
  - product-requirements.md
produces: plan.md
verify:
  approved-request: bash checks/verify-change.sh
  plan-present: test -s plan.md
---

Read the approved request.md and locate each selected story in
product-requirements.md. Plan the requested change within the approved
source paths. Read the captured project's existing
source, architecture, build instructions, and tests. Identify affected
components and consumers, the behavior that must stay compatible, the tests
that prove it, and migration or recovery risks. Follow the project's existing
languages, tools, and conventions. Trace the plan to the selected story,
architecture owner, acceptance criteria and check IDs. Flag conflicts
between the approved inputs for review.

Write only plan.md. Use the available file tools.
