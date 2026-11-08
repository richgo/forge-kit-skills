---
needs:
  - product-requirements.json
  - architecture.json
  - index.html
produces: requirements-verification.json
verify:
  website-trace: node checks/website-check.mjs
---

Write requirements-verification.json with these fields, using SHA-256 of the
exact input bytes (lowercase hexadecimal):

- requirementsSha256 for product-requirements.json
- architectureSha256 for architecture.json
- siteSha256 for index.html
- acceptance, an array of acceptance IDs in epic, feature, story, and criterion order

Use the shell to calculate exact digests. Do not change the inputs. The
independent replay checks these bytes, the ownership of each story in CALM,
and the declared coverage. Browser acceptance is recorded in a separate check.
