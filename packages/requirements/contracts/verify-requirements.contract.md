---
needs:
  - product-requirements.md
  - acceptance.json
  - plan.json
  - receipt.json
  - deployed.mjs
produces: requirements-verification.json
verify:
  requirements-trace: node checks/apmx-requirements-check.mjs
---

Write requirements-verification.json with requirementsSha256, artifactSha256, requirements,
and trace. Include the compiler identity and digests of the exact Markdown, independent acceptance fixture, and normalized model. Hash the exact approved product-requirements.md and deployed.mjs
bytes with SHA-256. Include the selected epic, feature, story, CALM node and
the acceptance criteria with their IDs and typed assertions. Use the same
trace shape as the receipt. The independent verifier recomputes the report
from the approved requirements, plan, receipt and artifact. It checks every selected assertion against the recorded
observation. Keep all inputs unchanged.
