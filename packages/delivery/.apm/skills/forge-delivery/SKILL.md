---
name: forge-delivery
description: Promote an independently verified artifact, observe readiness, and roll back on failure.
---

Check the signer, candidate digest and target environment policy before promotion. Capture the previous release. Run the environment's approved readiness probe against the newly active release and record its outcome. On failure, restore the previous release before routing to repair. Preserve the symptom and release evidence. A repair must pass fresh independent acceptance before another deployment.
