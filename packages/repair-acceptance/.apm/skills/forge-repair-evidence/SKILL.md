---
name: forge-repair-evidence
description: Prove a repair with the same observed behavior on the failing and corrected candidates.
---

Use the same bounded reproducer on both candidates. Confirm it fails for the reported symptom before the change and meets acceptance afterward. Preserve both candidate identities and the observed results. Escalate when the failure cannot be reproduced.
