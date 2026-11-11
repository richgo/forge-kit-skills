# Product requirements

Author requirements in Markdown using the
[template](templates/product-requirements.md) and [authoring guide](templates/authoring.md).
Each acceptance criterion links to a check registered by the consuming
project. That project defines how to exercise the criterion and verify the
result.

The version 1 compiler accepts a UTF-8 buffer or a string and returns
`{ schemaVersion: 1, epics }`. Each epic contains its features, each feature
contains its stories, and each story contains its architecture node IDs and
acceptance criteria. The compiler preserves source order and reports
structural errors with line numbers.

```js
import { readFile } from 'node:fs/promises';
import { parseMarkdownRequirements } from './checks/markdown-requirements.mjs';

const source = await readFile('product-requirements.md');
const requirements = parseMarkdownRequirements(source);
```

Use the original Markdown bytes when recording the approved source digest.
The compiler checks the document structure and identifier syntax. Resolve
the architecture node IDs and check IDs against the consuming project's
architecture and checks before building or verifying a story.
