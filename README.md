# Forge Kit Skills

Forge Kit's external Agent Package Manager (APM) catalog for the
requirements, build, review, and repair workflows.

| Package directory | Version | Primitives |
| --- | --- | --- |
| [`packages/build-repair`](packages/build-repair) | 0.1.0 | TDD, bounded diagnosis, and a repair prompt |
| [`packages/requirements`](packages/requirements) | 0.1.0 | Requirements skill, planning prompt, and spec reviewer |
| [`packages/security-review`](packages/security-review) | 0.1.0 | Report-only triage skill and security reviewer |
| [`packages/factory-workflows`](packages/factory-workflows) | 0.2.0 | Callable GH-AW reference workflow, typed repair routing, read-only MCP import, and repair planning |
| [`packages/architecture`](packages/architecture) | 0.1.0 | CALM requirement traceability and LikeC4 projection and drift check |
| [`packages/acceptance`](packages/acceptance) | 0.1.0 | APMX build contract and independent acceptance with signed in-toto evidence |
| [`packages/repair-acceptance`](packages/repair-acceptance) | 0.1.0 | APMX contract and independent before-and-after repair check |
| [`packages/delivery`](packages/delivery) | 0.1.0 | Gated promotion, HTTP readiness observation, and rollback |

## Consume a package

Use a reviewed full commit SHA in place of `<approved-commit-sha>`. Each
package has its own manifest and can be installed independently.

```sh
apm install 'richgo/forge-kit-skills/packages/build-repair#<approved-commit-sha>' --target copilot
```

In [GH-AW](https://github.github.com/gh-aw/reference/dependencies/), add the
canonical `shared/apm.md` import to the workflow repository at a reviewed
revision. Declare the packages in the workflow frontmatter and run
`gh aw compile` to regenerate the workflow lock.

```yaml
imports:
  - uses: shared/apm.md
    with:
      target: copilot
      packages:
        - richgo/forge-kit-skills/packages/build-repair#<approved-commit-sha>
```

The workflow and contract paths in [`exports.json`](packages/factory-workflows/exports.json)
are source exports. Copy the approved GH-AW fragment into the consumer's
`.github/workflows/shared/` before compilation. Give the caller only the
declared read permission and scope GitHub access to its approved repository.
APMX can select the contract from the pinned package with `apmx --from`.
Its workspace needs `failure.md`.

APM installs the agent primitives. The `exports.json` in each new package
also identifies executable source assets. Fetch those assets from the same
reviewed catalog commit. See [the reference runbook](docs/reference.md) for
the callable workflow, APMX package plans, and an offline rehearsal.

## Release and reuse

Update the affected package's manifest version, review the package diff, and
pin the resulting commit in each consumer. Verify the resolved graph and the
deployed files before promoting the pin. Keep upstream notices alongside
copied material. See [build and repair attribution](packages/build-repair/NOTICE.md).
The repository does not yet declare a license for original Forge Kit material.

The security starter is report-only and has no dependency on the upstream
Open SDLC security package. Add that dependency when a reviewed, licensed
release is available.
