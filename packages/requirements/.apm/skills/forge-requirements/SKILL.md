---
name: forge-requirements
description: Turn a requirements document into traceable acceptance criteria and a work graph.
---

# Specify and plan

Use the package's Epic → Feature → Story authoring template for structured
product requirements. Give every acceptance criterion a stable ID, a setup,
a supported action, and an executable assertion. Link each story to its
owning CALM node. Run the requirements verification contract against the
independently replayed candidate evidence.

Preserve the source requirements revision. Assign stable IDs to distinct requirements, retaining any existing IDs. For each, record the actor, observable outcome, and constraints. Write at least one acceptance case with setup, action, and expected result. Include failure cases where required by the source.

Separate facts, reversible assumptions, and open decisions. Return a clarification request when an ambiguity changes acceptance, security, cost, or irreversible behavior. Link each question to the affected requirement.

When the requirements are ready, define small end-to-end work items with requirement IDs, dependencies, and a verification command or expected artifact. Reject unknown dependency IDs and cycles. Keep test expectations reviewable independently of implementation.
