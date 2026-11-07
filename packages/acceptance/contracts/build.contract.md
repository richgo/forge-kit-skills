---
needs:
  - requirements.json
  - architecture.json
  - architecture.c4
produces: candidate.json
verify:
  acceptance: node checks/apmx-check.mjs
budget:
  max_attempts: 2
  max_seconds: 180
---

Implement the reference readiness requirement as candidate.json, a JSON object with exactly path, status and body. Read the architecture and view for the owning service. Keep the requirements and architecture inputs unchanged. Deliver the JSON data artifact and let the declared acceptance check decide whether it can advance.
