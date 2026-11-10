---
needs:
  - request.md
  - specification.md
  - changes.diff
  - implementation.md
produces: review.md
verify:
  review-present: test -s review.md
---

Review the independently checked change against the request, project
architecture, and expected behavior. Cite concrete files and lines in the
patch, distinguish observed facts from concerns, and flag missing tests,
unsafe changes, or approval requirements. State when there are no findings.
This is advisory review for the human reviewer.

Write only review.md. Leave the checked patch unchanged.
