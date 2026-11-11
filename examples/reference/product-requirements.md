# Product requirements

## Epic EPIC-001 — Reliable release promotion

Outcome: Release operators can tell when a service is ready to promote.

### Feature FEAT-001 — HTTP readiness

Outcome: The service reports its readiness over HTTP.

#### Story STORY-001 — Check the service readiness endpoint

Architecture owner: `readiness`

As a release operator, I want a readiness endpoint so I can check whether
the service is ready to promote.

##### Acceptance AC-001 — Report a ready service

- Given the service is deployed and ready
- When I request the readiness endpoint
- Then the service responds successfully with the ready status
- Check: `http.readiness`
