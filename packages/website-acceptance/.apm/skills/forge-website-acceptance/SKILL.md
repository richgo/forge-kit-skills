---
name: forge-website-acceptance
description: Plan, verify, or review a website product or architecture change against approved requirements and project-owned checks.
---

# Website change acceptance

1. **Admit the change.** Read the approved request, project revision, Markdown requirements, allowed paths, and protected check definitions. Identify the requested behavior, architecture constraints, and compatibility requirements.
2. **Plan and specify.** Trace each selected acceptance criterion to its affected pages, journeys, components, or interfaces. For a product change, state the observable behavior and what must remain compatible. For an architecture change, identify the affected interfaces, callers, failure behavior, and observable behavior to preserve. Record the project check that covers each claim.
3. **Build and verify.** Give the exact candidate patch to the project's independent verifier. In ForgeKit, use `.forge/verify-change` with the approved check IDs. Apply the patch in a disposable copy of the approved revision and use the project's build, browser, and API tools as required by the change. Check the approved success and failure cases and the regressions identified in the plan. Treat missing tools, checks, or results as gaps and keep the candidate and approved test inputs intact.
4. **Review the evidence.** Match each check result to the selected criterion and the candidate or built artifact digest. Compare affected architecture and interface claims with the project's approved models and observed behavior. Report missing, failed, or mismatched checks and state which paths or environments the evidence covers.
5. **Hand off for release.** Supply the checked artifact and evidence to the authorized release workflow. If the project requires signed in-toto attestations, verify the required signer and artifact digest at the handoff. Publication follows the project's release policy.
