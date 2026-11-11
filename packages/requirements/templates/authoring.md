# Author product requirements

Copy [product-requirements.md](product-requirements.md) and replace the sample
with the approved requirements. Keep the first line `# Product requirements`.
The compiler interprets this format as schema version 1.

| Level | Heading | Required content |
| --- | --- | --- |
| Epic | `## Epic EPIC-001 — Title` | One `Outcome: …` line describing the user or business outcome |
| Feature | `### Feature FEAT-001 — Title` | One `Outcome: …` line describing the capability |
| Story | `#### Story STORY-001 — Title` | An `Architecture owner:` line, a blank line, then the narrative |
| Acceptance criterion | `##### Acceptance AC-001 — Title` | Four consecutive bullets starting with `- Given`, `- When`, `- Then`, and `- Check:`, in that order |

Give each epic at least one feature, each feature at least one story, and
each story at least one acceptance criterion. Use a numeric suffix and keep
IDs stable and unique across the document. Use an em dash between each ID
and title. The story narrative may span multiple lines or paragraphs.

Write the CALM node IDs in backticks and separate multiple IDs with commas,
as in `` Architecture owner: `health_probe`, `release_api` ``.
Node IDs start with an ASCII letter or underscore and may contain digits,
hyphens, and underscores.

Write Given as the setup, When as the action, and Then as the observable
result. Enclose the Check ID in backticks. Check IDs start with a lowercase
ASCII letter and use lowercase letters and digits with single dots, hyphens,
or underscores between segments. Use IDs registered by the consuming
project. Keep executable assertions, fixture data, and verification
commands in that project.
