# AU20 proof-inventory red-proof history

## Prior review

`VERDICT: accept` covered the original 78-test red contract before implementation.
That acceptance was recorded by the pipeline coordinator but not persisted as its
own review artifact. No reviewer identity, timestamp, or historical test-file hash
is invented here.

The accepted change-map review remains separately preserved at
`plans/AU20/register-reviews/corrective-change-map.md` (SHA-256
`d08d48e4dd9526f8ca82b760a7b473b95c7590191c71224e71f3733d2e7681ee`).

## Implementation-review reopening

`VERDICT: pending re-review`

Implementation review found fail-open behavior outside the accepted 78-test proof.
Write-tests added 16 focused cases. Current result: 78 prior tests green, 16 new
tests red, 94 total. No implementation behavior changed for this reopening; the
new `canonicalizeClosedJson` seam is an explicit not-implemented throw.

Command:

```text
npx vitest run --project web packages/web/src/e2e-support/validation-contract.test.ts --reporter=json
```

Exit: `1`.

Current test-file SHA-256:
`0aee7e285fc110fbb53be0e1b8ca868b76777de3fce0cf13b0d00d30e0bd1a23`.

An independent pipeline reviewer must accept this revision before implementation
resumes.

## Reopened red review revision

`VERDICT: pending re-review`

The next reviewer required trusted provenance to be mandatory for payload and
lineage review, with closed canonical JSON proven through both unlock paths.
Fixtures now carry resolver/root/identity trust rather than treating caller maps
as authority.

Current focused result: 71 green, 34 red, 105 total; exit `1`. The authentic
canonical/trust fixture migration intentionally exposes additional failures in
the current implementation, while preserving the earlier behavioral
expectations.

Current test-file SHA-256:
`05bad29456fa1cec666b96ad322b10d985b8f419ba427c9f45bca97ee10935f2`.

## Accepted architecture amendment write-tests

`VERDICT: pending re-review`

Binding: `plans/AU20/register-reviews/proof-inventory-architecture-amendment.md`,
SHA-256
`18efb793121eb20f53063c0ffe0db628d16b559d07af160b651e0525be23c8c2`.

Tests now target the amended repository-composed contract:
`createFilesystemReviewVerifier`, captured `createValidationContracts`, claims-only
caller inputs, and strict terminal-before-next-start retry sequencing.

Current focused result: 105 green, 13 red, 118 total; exit `1`.

Test hashes:

- `validation-contract.test.ts`:
  `9edf040f70b7a93e960f282b1687b943abf652027e315c12888efb992f1cfebd`
- `review-trust.test.ts`:
  `32b30e5e382559b5af25fac33e8c66c801dbd530f7f5b017ed26021a33b3295c`

## Amendment red-review revision

`VERDICT: pending re-review`

Added repository-composition invocation plus fail-closed artifact, accepted-root,
and actor-manifest cases requested by the amendment reviewer. All use real
temporary filesystem objects.

Current focused result: 105 green, 28 red, 133 total; exit `1`.

Current test hashes:

- `validation-contract.test.ts`:
  `9edf040f70b7a93e960f282b1687b943abf652027e315c12888efb992f1cfebd`
- `review-trust.test.ts`:
  `f5c0f94caecf6e3c17e2130f97573b4a865c7cec49c3c4b5ce16fa1e9989914d`

## Accepted R3 architecture amendment write-tests

`VERDICT: pending re-review`

Binding: `plans/AU20/register-reviews/proof-inventory-architecture-amendment-r3.md`,
SHA-256
`51336cc090c2951a84bcea613da2e64d0f920acd054e29768fae54703e7c134c`.

Manifest fixtures now bind relative artifact path, reviewer, mandatory builder,
artifact hash, reviewed payload hash, and accept verdict. Tests add manifest hash
pinning, artifact+claim rewrite resistance, descriptor-stable exact-byte
provenance, and both payload/lineage builder omission/mismatch/self-review.

Current focused result: 119 green, 23 red, 142 total; exit `1`.

Current test hashes:

- `validation-contract.test.ts`:
  `9edf040f70b7a93e960f282b1687b943abf652027e315c12888efb992f1cfebd`
- `review-trust.test.ts`:
  `9b74c844f2da0ce22e01e31dc74b7b7603a00a59f4f5ad3497cf386e0212dfbb`

## Accepted R3 red-review revision

`VERDICT: pending re-review`

The closed versioned manifest fixture is now the positive baseline. New proofs
cover omitted builder identity, empty reviewer/builder identities, unknown
top-level and entry fields, exact and normalized duplicate canonical artifact
paths, payload+claim rewrite through direct/payload/lineage paths, and a
construction-owned deterministic canonical-path replacement hook.

`expectedManifestSha256` is mandatory in `FilesystemReviewVerifierOptions`; all
direct positive constructions carry the exact fixture hash.

Current focused result: 119 green, 34 red, 153 total; exit `1`.

Focused JSON SHA-256:
`3edb9b5e440a11e68dca9e475d59ec1563e298f179e20cf52c17299ad0a6f899`.

Current test hashes:

- `validation-contract.test.ts`:
  `9edf040f70b7a93e960f282b1687b943abf652027e315c12888efb992f1cfebd`
- `review-trust.test.ts`:
  `fc3c8bc7bd1690d27851024f4e05aed5e819cda58e72ef3d9d5cf65da9569ec7`

## R3 factory caller migration

`VERDICT: pending re-review`

Supersedes the prior `accepted-r3-red-review-revision` test hashes. All
`validation-contract.test.ts` callers now use `createValidationContracts` with
a captured verifier: zero `ReviewTrust` references, zero standalone unlock
calls, and zero free inventory calls. The 14 inventory calls target the
factory-returned closure.

Contradictory expectations were corrected to require the original Node
`Buffer` and filesystem `realpath`. Test count remains 153.

Current focused result: 111 green, 42 red, 153 total; exit `1`.

Focused JSON SHA-256:
`7cf7c8eebc89b065cedbfc30b8c6bbe8345544a607fbd60112dbde2d8c05ccb2`.

Current test hashes:

- `validation-contract.test.ts`:
  `ffef339bf58f987e39f14b31c2ae67f5f6bd465aa79bbe7cb35a6c6e1d898d2e`
- `review-trust.test.ts`:
  `1aea108da78586d301e35760fb8505f5795b5b2fef7232ca689660880749c758`

## Reopened red review acceptance

`VERDICT: accept`

Reviewer identity:
`pipeline-reviewer:/root/au20_proof_inventory_red_review`.

The focused command reproduced **105 total: 71 green + 34 intentionally red**,
exit `1`. The shift from 78/16 is explained by migrating seven formerly green
fixtures onto the mandatory trusted-provenance and closed-canonical-JSON
contracts; no prior behavioral expectation was removed.

Accepted test-file SHA-256:
`05bad29456fa1cec666b96ad322b10d985b8f419ba427c9f45bca97ee10935f2`.

Durable red-proof JSON SHA-256:
`99035cb385e4a578c9c80c7fa6bee145050ab1946fc4895cf563a4d5aba26bfa`.

Focused JSON result SHA-256:
`d3e83d56011d801ecf3f5923c7b8d1c9bceeb7bf0987f57055530676cc65f113`.

Accepted scope: mandatory trusted resolver/root provenance for payload and
lineage review, exact trusted builder/reviewer identity binding, no
caller-provided artifact fallback, recursive closed canonical JSON through both
hashing paths, and the previously reopened single-run/temporal/lineage
boundaries. Implementation may resume against this exact test content only.

## Architecture-amendment red-proof acceptance

`VERDICT: accept`

Reviewer identity:
`pipeline-reviewer:/root/au20_proof_inventory_red_review`.

The amendment command reproduced **133 total: 105 green + 28 intentionally
red**, exit `1`. The prior 105-case contract remains green. New failures are
limited to the accepted filesystem-verifier, repository-composition, and strict
attempt-sequencing amendment.

Architecture-amendment binding:

- Review:
  `plans/AU20/register-reviews/proof-inventory-architecture-amendment.md`
- Review SHA-256:
  `18efb793121eb20f53063c0ffe0db628d16b559d07af160b651e0525be23c8c2`
- Architecture SHA-256:
  `9cd55b5634cac06ac01ac9638f452128191b5583250cf9861e0aa8fe6af61f7f`
- Feasibility SHA-256:
  `972be13a717cc2b6c3250cce208cffe228ada65694febe96bbf6d56feea18ff5`

Accepted test hashes:

- `validation-contract.test.ts`:
  `9edf040f70b7a93e960f282b1687b943abf652027e315c12888efb992f1cfebd`
- `review-trust.test.ts`:
  `f5c0f94caecf6e3c17e2130f97573b4a865c7cec49c3c4b5ce16fa1e9989914d`

Durable red-proof JSON SHA-256:
`40e62387062bdb7ed656046a66ac7287f61de7c6fbf9d0732d2fc587f1df6783`.

Focused JSON result SHA-256:
`ea7f0eef42efe3a5565879c152214672b36f4b74d16d625fea07a0bf98f5cdf3`.

Accepted scope: realpath and regular-kind enforcement for repository review
artifacts, accepted root, and actor manifest; traversal, lexical-prefix and
symlink containment; artifact bytes/hash/payload/verdict and manifest actor
binding; repository composition capturing one verifier for payload and lineage
with no request override; and terminal-before-retry causality. Implementation
may resume only against these exact test hashes and amendment binding.

## R3 architecture-amendment red-proof acceptance

`VERDICT: accept`

Reviewer identity:
`pipeline-reviewer:/root/au20_proof_inventory_red_review`.

The R3 command reproduced **153 total: 119 green + 34 intentionally red**, exit
`1`. The red set is limited to the accepted R3 manifest/provenance,
descriptor-stability, replacement-only factory, and retained amendment
obligations.

R3 binding:

- Review:
  `plans/AU20/register-reviews/proof-inventory-architecture-amendment-r3.md`
- Review SHA-256:
  `51336cc090c2951a84bcea613da2e64d0f920acd054e29768fae54703e7c134c`
- Architecture SHA-256:
  `4f600566b27f210b4399322b37b399cd51f9f66c4c37cce7c30377667d990793`
- Feasibility SHA-256:
  `c6ce225bfaa0b5712975313a1c2206ccd6f5d967e1882ce8d4c0f27a39527f1a`

Accepted test hashes:

- `validation-contract.test.ts`:
  `9edf040f70b7a93e960f282b1687b943abf652027e315c12888efb992f1cfebd`
- `review-trust.test.ts`:
  `fc3c8bc7bd1690d27851024f4e05aed5e819cda58e72ef3d9d5cf65da9569ec7`

Durable red-proof JSON SHA-256:
`8b3eeaae8479832d95894f12d71f9201c69a4989c77e14f13c3fedf5a129477f`.

Reviewer focused JSON result SHA-256:
`69cdecd55383b8ef00fd4f112d83010d755ae219c33bf0ab082c308dbf96fef0`.

Accepted scope: closed versioned manifest schema with mandatory identities and
no unknown fields; duplicate canonical-path rejection; mandatory manifest hash
pinning; artifact and payload/claim rewrite resistance through direct and
repository-composed payload/lineage paths; exact returned descriptor bytes; and
deterministic descriptor/path replacement rejection.

Legacy authority exports and callers must be physically deleted together during
the green implementation. Their absence is a static import/export/knip/type
boundary, not a runtime source-reading test.

## R3 factory-caller migration red-proof acceptance

`VERDICT: accept`

Reviewer identity:
`pipeline-reviewer:/root/au20_proof_inventory_red_review`.

This acceptance supersedes the prior R3 test hashes. The focused command
reproduced **153 total: 111 green + 42 intentionally red**, exit `1`.

All test callers now use `createValidationContracts` with a captured verifier:
zero `ReviewTrust` references, zero standalone unlock calls, zero free inventory
calls, and 14 inventory calls through the factory-returned closure. The eight
additional red cases are replacement/deletion/factory-verifier behavior, not
type or import failures. Byte and path expectations now require the original
Node `Buffer` and filesystem `realpath`.

R3 binding remains:

- Review SHA-256:
  `51336cc090c2951a84bcea613da2e64d0f920acd054e29768fae54703e7c134c`
- Architecture SHA-256:
  `4f600566b27f210b4399322b37b399cd51f9f66c4c37cce7c30377667d990793`
- Feasibility SHA-256:
  `c6ce225bfaa0b5712975313a1c2206ccd6f5d967e1882ce8d4c0f27a39527f1a`

Accepted replacement test hashes:

- `validation-contract.test.ts`:
  `ffef339bf58f987e39f14b31c2ae67f5f6bd465aa79bbe7cb35a6c6e1d898d2e`
- `review-trust.test.ts`:
  `1aea108da78586d301e35760fb8505f5795b5b2fef7232ca689660880749c758`

Durable red-proof JSON SHA-256:
`2f338ac0afeeff20ed59b08a7f42afcba40c0ca81dffb9f6f06ac7a3526b1bf0`.

Reviewer focused JSON result SHA-256:
`e34024186dad3ccf2d003481902444244504748a4e654d04e0fddb047e7494a4`.

Implementation may resume only against these superseding test hashes. The green
change must physically delete the legacy authority exports and migrate
production callers atomically.
