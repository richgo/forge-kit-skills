# Product requirements

## Epic EPIC-001 — Release confidence

Outcome: Operators can see when releases are ready.

### Feature FEAT-001 — Readiness reporting

Outcome: Operators can check readiness for the current release.

#### Story STORY-001 — Check release readiness

Architecture owner: `health_probe`

As a release operator, I want to check whether the deployed release is ready
so I can decide when to promote it.

##### Acceptance AC-001 — Report readiness

- Given the verified release is deployed
- When I run the readiness probe
- Then I see the ready status
- Check: `readiness.stdout`

##### Acceptance AC-002 — Signal successful completion

- Given the verified release is deployed
- When I run the readiness probe
- Then the probe exits successfully
- Check: `readiness.exit-code`
