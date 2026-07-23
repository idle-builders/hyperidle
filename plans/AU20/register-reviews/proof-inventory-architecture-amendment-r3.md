# AU20 proof-inventory architecture amendment R3 review

VERDICT: ACCEPT

Reviewed scope: single captured verifier, hash-pinned closed review manifest with mandatory builder identity, descriptor-stable reads, physical legacy-authority deletion, strict attempt sequencing, and net trust-path simplification.

## Bound sources

- Architecture SHA-256: `4f600566b27f210b4399322b37b399cd51f9f66c4c37cce7c30377667d990793`
- Feasibility SHA-256: `c6ce225bfaa0b5712975313a1c2206ccd6f5d967e1882ce8d4c0f27a39527f1a`
- Accepted classification payload SHA-256: `76a632f2d8513b359f063dc072f1a057d356889fdea4649667e865bc76dad041`
- Accepted classification review SHA-256: `d08d48e4dd9526f8ca82b760a7b473b95c7590191c71224e71f3733d2e7681ee`

## Independent checks

- `ReviewManifestEntry.builderIdentity` is mandatory. The closed schema rejects omission, empty identities, unknown fields, and duplicate canonical artifact paths.
- Verification requires manifest builder = repository-composition captured builder = claimed builder, manifest reviewer = claimed reviewer, and reviewer ≠ builder. Omission, mismatch, and self-review cases are required through both payload unlock and lineage.
- Legacy exported `ReviewTrust`, standalone `assertReviewedPayloadUnlocked`, and authority-bearing free `buildValidationInventory` are physically deleted. No alias, deprecation, or compatibility path may coexist. All callers migrate to operations returned by one `createValidationContracts({ reviewVerifier })`.
- Repository composition creates one verifier before request parsing; payload and lineage use that captured instance exclusively.
- The repository-pinned manifest binds canonical artifact path, reviewer, mandatory builder, artifact hash, payload hash, and accept verdict. Rewriting an artifact and its caller claims cannot mint provenance.
- Canonical realpath containment plus one read-only descriptor, descriptor/path identity checks, same-descriptor Buffer read, post-read metadata verification, and hashing/returning the same bytes provide proportional Node/macOS verification. No PKI or parallel security framework is introduced.
- Static export/caller checks and imported runtime tests cover migration, manifest tampering, descriptor swaps, traversal/prefix/symlink/nonfile cases, identity/verdict/payload mismatch, shared verifier use, and strict terminal-before-retry causality.
- Production trust-path LOC must be net-negative; duplicate authority resolution is deleted rather than wrapped.
- Deterministic JSON/Markdown regeneration is byte-identical and base validation passes.
- The accepted 604-case payload and classification-review hashes remain unchanged. R3 amendment review/red-proof bindings are still null, `authorizedStage` is null, and both write-tests and code locks remain true.

## Binding

Acceptance applies only to the architecture and feasibility hashes above and the unchanged classification binding. The planner must embed this artifact's path and SHA-256 as the R3 architecture-amendment acceptance, preserve the classification binding, keep code locked, and unlock only R3 `/write-tests` through amendment-aware regeneration and validation. Any bound-source change requires fresh independent review.
