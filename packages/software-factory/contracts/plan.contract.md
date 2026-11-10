---
needs: request.md
produces: plan.md
verify:
  plan-present: test -s plan.md
---

Plan the requested change against the captured project. Read its existing
source, architecture, build instructions, and tests. Identify affected
components and consumers, the behavior that must stay compatible, the tests
that prove it, and migration or recovery risks. Follow the project's existing
languages, tools, and conventions. Treat the approved request as authoritative
and flag conflicts or missing acceptance criteria for review.

Write only plan.md. Use the available file tools.
