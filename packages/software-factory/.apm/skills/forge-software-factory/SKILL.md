---
name: forge-software-factory
description: Prepare or review a consumer project for the Forge Kit APMX software factory.
---

Keep the consumer's application languages and tools. The APMX contracts
describe artifact handoffs and use the approved consumer checker for the
build gate.

Check that the reviewed base contains the required source, versioned
`specs/product-requirements.md`, a `request.md` selecting stories and exact source
paths, and a `.forge/verify-change` entry point. It receives the unapplied
patch and the distinct acceptance check IDs selected by the factory.
It must validate the scope, reject unknown check IDs, keep approved
acceptance inputs intact, and run the checks on a disposable candidate.
If the base includes .forge/openspec.json, use the reviewed OpenSpec change
to trace every selected acceptance criterion to a delta scenario. Preserve
the reviewed binding and OpenSpec files through delivery. When
.forge/verify-baseline is present, the plan gate requires the reviewed base
checks to report the expected missing behavior before the build begins.
Keep execution isolated from
credentials and other projects. Treat planning and review reports as
advice and use the independent check result as the build gate.
