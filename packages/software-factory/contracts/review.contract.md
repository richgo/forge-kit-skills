---
needs:
  - request.md
  - specs/product-requirements.md
  - specification.md
  - changes.diff
  - implementation.md
produces: review.md
verify:
  review-present: test -s review.md
---

Review the independently checked change against the approved request scope,
the selected stories and acceptance criteria, and the project architecture.
Cite concrete files and lines in the
patch, distinguish observed facts from concerns, and flag missing tests,
unsafe changes, or approval requirements. State when there are no findings.
This is advisory review for the human reviewer.

Write only review.md. Leave the checked patch unchanged.
