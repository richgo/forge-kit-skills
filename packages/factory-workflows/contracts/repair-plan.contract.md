---
needs: failure.md
produces: repair-plan.json
budget:
  max_attempts: 2
  max_seconds: 180
verify:
  valid-plan-json: python3 -m json.tool repair-plan.json
---

Read the reported failure and produce a JSON object with `symptom`,
`candidate_revision`, `reproduce`, `hypotheses`, and `next_check` fields.
Use null for an unknown revision and describe any missing evidence in
`next_check`. Propose verification steps without editing the application.
The declared check validates JSON syntax. Acceptance still requires
independent evidence that the reproducer exercises the reported symptom.
