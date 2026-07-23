# AU20 proof-inventory architecture amendment review

VERDICT: ACCEPT

Reviewed scope: trusted review composition and strict attempt sequencing.

## Bound sources

- Architecture SHA-256: `9cd55b5634cac06ac01ac9638f452128191b5583250cf9861e0aa8fe6af61f7f`
- Feasibility SHA-256: `972be13a717cc2b6c3250cce208cffe228ada65694febe96bbf6d56feea18ff5`
- Accepted classification payload SHA-256: `76a632f2d8513b359f063dc072f1a057d356889fdea4649667e865bc76dad041`
- Accepted classification review SHA-256: `d08d48e4dd9526f8ca82b760a7b473b95c7590191c71224e71f3733d2e7681ee`

## Independent findings

- `ReviewVerifier` is created once by `scripts/validation-composition.ts` from repository-owned root, accepted-review root, actor manifest, and builder identity. Unlock and lineage contracts receive the captured verifier; request data cannot supply or replace its resolver, roots, bytes, manifest, or trusted identities.
- `packages/web/e2e/support/review-trust.ts` owns the filesystem verifier; `packages/web/e2e/support/validation-contract.ts` owns payload and lineage use through `createValidationContracts({ reviewVerifier })`. This is one narrow verification seam, not a signing or PKI subsystem.
- Repository root, accepted-review root, actor manifest, and artifact are realpath-resolved. Verification rejects non-regular artifacts, repository/accepted-root escapes, lexical-prefix siblings, and symlinks whose resolved target escapes. Bytes are read and hashed only after canonical containment.
- Reviewer identity comes from the repository actor manifest keyed by canonical review path. Claimed reviewer and builder identities must equal trusted values, and reviewer must differ from the captured builder.
- Payload unlock and lineage validation use the same verifier result, canonical bytes/hash, actor provenance, verdict, and payload/lineage hash rules.
- Attempt sequencing is strict per identity: attempt N must have exactly one terminal ending no later than attempt N+1 start. An unmatched earlier start keeps reconciliation incomplete and makes later terminals non-authoritative. Duplicate/conflicting terminals, terminal-before-start, overlap, and retry after pass/block are hard errors.
- Feasibility identifies existing Node filesystem primitives and requires no new cryptographic infrastructure.
- The `proof-inventory` task owns the exact factory, composition, contract, inventory, and reconcile files. Its verification list covers caller forgery, traversal/prefix/symlink/nonfile cases, artifact mutation, actor/builder mismatch, shared verifier use, and unmatched-start retry masking.
- The existing accepted red proof predates this amendment. The next authorized stage is `/write-tests` for the new amendment cases, independent red-proof review, then implementation—not direct `/write-code`.
- Deterministic regeneration is byte-identical and base validation passes. The accepted 604 classification payload and review hashes are unchanged; the amendment is separately required with `acceptedReview:null` and `writeTestsLocked:true`.

## Binding

Acceptance applies only to the architecture and feasibility hashes above and the unchanged accepted classification hashes. Any change invalidates this review. The planner must embed this artifact's path and SHA-256 as the proof-inventory architecture-amendment acceptance, preserve the accepted classification binding, clear the lock only for the amendment's `/write-tests` stage, regenerate, and pass the amendment-aware review validator.
