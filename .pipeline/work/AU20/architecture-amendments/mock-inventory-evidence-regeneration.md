# AU20 architecture amendment — mock inventory evidence regeneration

## Decision

`mock-inventory:check` is stale only because accepted AU20 source deletion moved three
surviving literal-id findings and removed one duplicate occurrence. Regenerate the
repository-owned mock inventory with its existing generator. Do not edit source,
generator, guard, or generated content by hand.

## Acceptance criteria

- **AC-M1 — Red is pinned.** A static proof records the exact current 3 added / 4
  removed rows, occurrence counts/kind/symbol, and binds source, generator, and
  existing artifact hashes. The three additions are relocated surviving `u-founder`
  literal-id rows; the fourth removal is an eliminated duplicate occurrence.
- **AC-M2 — Generation is same-day idempotent.** Two generator runs from the same
  source produce byte-identical `inventory.json`, `inventory.md`, and `queue.md`.
  Capture UTC date before/between/after runs, bind the emitted date, and reject a date
  rollover instead of misclassifying it as content drift.
- **AC-M3 — Scope is evidence-only.** Only generator-owned files under
  `plans/mock-data-purge/` may change: `inventory.json`, `inventory.md`, and
  `queue.md`. Freeze and hash authored `follow-ups.md` and `test-coverage-gap.md`.
  Product, tests, scripts, gates, census, package manifests, and locks remain frozen.
- **AC-M4 — Gate advances.** `npm run mock-inventory:check` exits zero; check/lint/test
  and census remain green. `npm run verify:release` must pass the mock-inventory phase
  and record the first subsequently reached phase/result.

## Technical task tree

#### `pin-mock-inventory-staleness`
- **Kind:** implementation
- **Owns:** `file:.pipeline/work/AU20/probes/validate-mock-inventory-regeneration.mjs`, `file:.pipeline/work/AU20/red-proofs/mock-inventory-regeneration.json`
- **Consumes:** `scripts/mock-inventory.ts`, source files named by the check, current generated inventory
- **ACs:** AC-M1, AC-M2, AC-M3
- **Verify:** validator exits red only for stale generated evidence
- **Parallel:** no

#### `regenerate-mock-inventory`
- **Kind:** mechanical
- **Depends on:** `pin-mock-inventory-staleness`
- **Owns:** `file:plans/mock-data-purge/inventory.json`, `file:plans/mock-data-purge/inventory.md`, `file:plans/mock-data-purge/queue.md`
- **Consumes:** accepted frozen validator/proof and `scripts/mock-inventory.ts`
- **ACs:** AC-M2, AC-M3, AC-M4
- **Verify:** generate twice, validator/check green, full scoped gates green
- **Parallel:** no

## Contracts

No runtime contract changes. Generated rows must be derived from current source by
`npm run mock-inventory`; manual additions, deletions, or line edits are forbidden.
All three generator-owned outputs are protected against same-day second-run changes.
`follow-ups.md` and `test-coverage-gap.md` are not generator outputs and are frozen.

## Security and abuse

No routes, credentials, user input, paths from external callers, or outbound requests
change. Rate limiting, secret handling, path traversal, SSRF, and agent-input trust are
N/A.

## Risks

The generator stamps dates. The validator must capture UTC date at all run boundaries,
reject rollover, bind the emitted date, and compare all three generated output bytes.
