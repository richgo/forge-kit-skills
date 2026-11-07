---
needs:
  - failure.json
  - before.json
  - candidate.json
produces: repair-evidence.json
verify:
  reproduced-and-repaired: node checks/repair-evidence.mjs
budget:
  max_attempts: 2
  max_seconds: 180
---

Describe the one HTTP GET that reproduces the recorded failure and passes for the repaired candidate. Write repair-evidence.json with path, beforeStatus, beforeBody, afterStatus and afterBody. Copy these values from the supplied failure report. Do not change the recorded failure or either candidate. The independent checker replays the same data-only request against both revisions.
