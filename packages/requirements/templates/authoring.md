# Epic, Feature, Story

Copy [product-requirements.json](product-requirements.json) as the executable
template. Add each feature under its owning epic and each story under its
owning feature. Keep IDs stable and unique across the document.

| Level | Fill in |
|---|---|
| Epic | Title and the user or business outcome |
| Feature | Title and a capability that advances the epic outcome |
| Story | Title, actor, need, benefit, and owning CALM node ID |
| Acceptance criterion | Stable ID, setup in Given, supported action in When, and a typed assertion in Then |

The readiness reference profile supports the action `run-readiness-probe`
and assertions for `stdout` and `exitCode`. Include both for each story.
Write the expected output without its trailing newline. Use exit code zero
for a successful probe. The Given field describes the fixture setup for a
reviewer. To add another action, ship its executable checker with the new
contract before using it in a story.

A product document may contain multiple epics, features, and stories. A
reference run verifies one explicitly selected story. The checker's report
includes the parent IDs, acceptance IDs, original document digest, and
deployed artifact digest.
