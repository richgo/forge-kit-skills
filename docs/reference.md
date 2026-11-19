# Reference lifecycle

This runbook covers the readiness and recovery fixture built from the
catalog's acceptance, repair and workflow packages. For reviewed OpenSpec
changes, use the [native software-factory package](../packages/software-factory/README.md).
For shared specifications and implementation units, see
[ForgeKit's checkout reference](https://github.com/richgo/forge-kit/blob/main/docs/reference-checkout.md).

The reference defines an HTTP readiness story in
[`product-requirements.md`](../examples/reference/product-requirements.md).
The story links to the CALM service and the independent HTTP assertion in
[`acceptance.json`](../examples/reference/acceptance.json). The runtime
compiles both sources into the input used by the HTTP checker. The CALM
model owns the service IDs and connections, and the checker rejects a LikeC4
view that differs from the generated projection. The acceptance checker
compares the candidate response descriptor with the HTTP assertion. Its
in-toto Statement binds the compiler version and exact digests of the
candidate, Markdown, fixture, generated input, CALM model, and LikeC4 view.

## Run locally

Use Node.js 20 or later and a fresh output directory.

```sh
node --test
node packages/factory-workflows/runtime/cli.mjs rehearse out/healthy
node packages/factory-workflows/runtime/cli.mjs rehearse out/recovery --fail-first-observation
```

The second run injects a failed readiness observation, rolls back, and allows
one fresh build and check. The environment stores immutable versions by
digest and serves readiness on loopback. Deployment is scoped to the fixture
directory. A timed-out or rejected decision escalates after rollback. Setting
`FORGE_JEV_TOKEN` opts into the TypeSafe choice API on an eligible failure.
The request sends a fixed description of the failure. Local policy owns the
allowed route, probability threshold, and single-attempt limit.

## Call the compiled workflow

The package owns the workflow source and read-only MCP fragment. The
catalog publishes their GitHub entry points and compiled lock under
`.github/workflows`. Call the workflow on GitHub.com by a reviewed full
commit SHA and pass an approved Copilot credential.

```yaml
jobs:
  reference:
    uses: richgo/forge-kit-skills/.github/workflows/forge-reference.lock.yml@<reviewed-commit-sha>
    permissions:
      contents: read
      actions: read
    secrets:
      COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
```

The producer uploads only candidate bytes. A fresh job checks the candidate
and creates an Ed25519 DSSE envelope. The public key is delivered to the
promotion job as a trusted job output. The promotion job verifies the
signature and checks the candidate and materials again. This gives
in-run signer isolation. Production consumers need a durable signer
identity and an approved environment adapter.

GH-AW's agent provides an advisory run summary. Its GitHub MCP has read-only
file access, and its only safe output is a run-summary log. The jobs load
the runtime from the same catalog commit that defines the reusable workflow.

## Plan the APMX contracts

From the catalog root, copy the reference into a disposable directory and
generate the JSON input used by the acceptance contract. Use APMX 0.8.0 and
replace the pin with a reviewed full commit SHA.

```sh
workspace="$(mktemp -d)"
cp -R examples/reference/. "$workspace/"
node packages/factory-workflows/runtime/cli.mjs stage-requirements "$workspace"
cd "$workspace"
apmx --from 'richgo/forge-kit-skills/packages/acceptance#<reviewed-commit-sha>' --plan
apmx --from 'richgo/forge-kit-skills/packages/repair-acceptance#<reviewed-commit-sha>' --plan
```

The build package checks a proposed response against its acceptance case.
For repair evidence, the same data-only GET descriptor is checked against
the failing revision and the repaired candidate. The checker runs no
agent-supplied commands. For an authenticated harness run, use an isolated
environment, then replay the resulting receipt with `apmx check` in a fresh
job before promotion. The callable reference workflow uses the deterministic
fixture producer and does not invoke the APMX agent.

## Regenerate the GitHub entry points

Copy the workflow and MCP source from
`packages/factory-workflows/workflows` to `.github/workflows`, preserving
the shared subdirectory. Compile with GH-AW 1.0.1.

```sh
gh aw compile forge-reference --no-check-update --no-logo --gh-aw-ref 0627fdbe4beb5f3b71aa569f8d97150b87f2111a
```

The catalog CI compares the committed lock with the compiler result and
checks the CALM and LikeC4 files with their official validators.
