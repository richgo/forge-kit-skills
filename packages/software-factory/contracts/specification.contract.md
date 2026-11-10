---
needs:
  - request.md
  - plan.md
produces: specification.md
verify:
  specification-present: test -s specification.md
---

Turn the checked plan into an implementation specification. Trace each
proposed change to the request and its acceptance criteria. Identify files
and interfaces to change, dependencies and architecture constraints to
preserve, and the project tests that cover the requested behavior. Where
the project uses CALM and LikeC4, identify the owning components and required
model and view updates. Use the project's existing stack.

Write only specification.md. The approved request and supplied checks
remain authoritative if the plan or specification conflicts with them.
