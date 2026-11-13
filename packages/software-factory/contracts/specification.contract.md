---
needs:
  - request.md
  - specs/product-requirements.md
  - plan.md
produces: specification.md
verify:
  specification-present: test -s specification.md
---

Turn the checked plan into an implementation specification. Trace each
proposed change to a requested story and its acceptance criteria in
specs/product-requirements.md. Identify approved files
and interfaces to change, dependencies and architecture constraints to
preserve, and the project tests that cover the requested behavior. Where
the project uses CALM and LikeC4, identify the owning components and required
model and view updates. Use the project's existing stack.

When .forge/openspec.json is present, cite the selected OpenSpec change and
scenario titles alongside each acceptance ID. Describe how the approved checks
will prove those scenarios, including the expected base failure when the
project provides a baseline verifier. Keep the OpenSpec artifacts intact.

Write only specification.md. Follow the approved scope, requirements and
supplied checks if the plan conflicts with them.
