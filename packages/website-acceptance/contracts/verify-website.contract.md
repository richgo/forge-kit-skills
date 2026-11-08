---
needs:
  - product-requirements.json
  - architecture.json
  - architecture.c4
  - index.html
produces: requirements-verification.json
verify:
  website-trace: node checks/website-check.mjs
---

Run the following shell command now in the working directory that contains
the four input files. Execute it with the shell tool so it actually creates
the required deliverable. A chat response or a suggested command alone
does not deliver the file. Leave the input files unchanged.

```sh
node -e '
const fs = require("node:fs");
const crypto = require("node:crypto");
const digest = path => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
const spec = JSON.parse(fs.readFileSync("product-requirements.json", "utf8"));
const acceptance = spec.epics.flatMap(epic => epic.features.flatMap(feature => feature.stories.flatMap(story => story.acceptanceCriteria.map(check => check.id))));
fs.writeFileSync("requirements-verification.json", JSON.stringify({
  requirementsSha256: digest("product-requirements.json"),
  architectureSha256: digest("architecture.json"),
  viewSha256: digest("architecture.c4"),
  siteSha256: digest("index.html"),
  acceptance
}, null, 2) + "\n");
'
```

Confirm the resulting file exists, then finish. Independent replay verifies
the digests, CALM ownership, and acceptance coverage. The worker runs browser
acceptance in a separate job.
