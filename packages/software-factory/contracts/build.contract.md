---
needs:
  - request.md
  - product-requirements.md
  - plan.md
  - specification.md
  - .forge/verify-change
produces:
  - changes.diff
  - implementation.md
budget:
  max_attempts: 2
  max_seconds: 600
verify:
  project-acceptance: bash checks/verify-change.sh changes.diff
  implementation-present: test -s implementation.md
---

Implement the selected stories in the private copy of the project, following
the project's language, build tools, and conventions. Edit only the exact
source paths approved in request.md. Preserve the approved requirements and
request, verification entry point, independent checks, workflows and factory
policy files. If the change needs a new runtime, dependency, or
policy approval, describe it in the implementation report for review.

Write implementation.md with the changes, selected story and acceptance IDs, and
limitations. Use the supplied export_changes tool once, with output
changes.diff, to export the actual edits. Use workspace-relative file tools
and the bounded exporter. Leave executing commands and checking the patch to
the independent project verifier.
