---
needs:
  - product-requirements.json
  - plan.json
  - receipt.json
  - deployed.mjs
produces: requirements-verification.json
verify:
  requirements-trace: node checks/apmx-requirements-check.mjs
---

Write requirements-verification.json with requirementsSha256, artifactSha256,
and trace. Hash the exact approved product-requirements.json and deployed.mjs
bytes with SHA-256. Include the selected epic, feature, story, CALM node and
the acceptance criteria with their IDs and typed assertions. Use the same
trace shape as the receipt. The independent verifier recomputes the report
from the approved requirements, plan, receipt and artifact. It checks every selected assertion against the recorded
observation. Keep all inputs unchanged.
