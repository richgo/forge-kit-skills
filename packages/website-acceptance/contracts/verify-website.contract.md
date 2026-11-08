---
needs:
  - product-requirements.json
  - architecture.json
  - architecture.c4
  - index.html
  - candidate-evidence.json
produces: requirements-verification.json
verify:
  website-trace: node checks/website-check.mjs
---

Read candidate-evidence.json. Use the write tool to create
requirements-verification.json in the current directory with that exact JSON.
Write the file now, then finish. Keep the five inputs unchanged.

The candidate evidence is a proposed report. The independent checker
recomputes the digests of the four approved inputs, checks the CALM owners,
and verifies acceptance coverage. The worker verifies Chromium separately.
