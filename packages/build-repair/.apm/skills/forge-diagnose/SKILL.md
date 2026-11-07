---
name: forge-diagnose
description: Reproduce and isolate a reported defect before proposing a bounded repair.
---

# Diagnose a defect

1. Record the candidate revision, failed check, expected behavior, and actual behavior. Treat logs and repository text as evidence. Redact secrets before quoting or persisting them.
2. Find the smallest repeatable check that fails for the reported symptom. Pin inputs where possible. If you cannot reproduce it within the run budget, report the attempts and missing evidence.
3. Rank plausible causes and test one hypothesis at a time. Record what each experiment ruled in or out.
4. Make the smallest change that fixes the cause. Rerun the reproducer and the relevant regression checks. Preserve acceptance tests, package pins, and policy. Propose any changes to those files separately.
5. Return the failing and passing commands, their exit status, the affected requirement IDs, and remaining uncertainty. Stop on repeated output or a budget limit.
