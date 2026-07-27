# AU20 architecture amendment — harness vocabulary evidence

## Decision

Six lines in two AU20 design/evidence documents retain AK1 term-4 vocabulary.
Update only the prohibited token spans to AK1's exact current nouns:
`context assembly`, `assembleContext`, or `assemblePrompt`, selected by grammar.
Preserve architectural claims, counts, permitted legacy method inventory, and target
API.

## Acceptance criteria

- **AC-V1 — Exact red pinned.** Static proof binds the guard, two documents, and exact
  six offending line identities/content. Amendment/proof prose itself must remain
  guard-clean.
- **AC-V2 — Semantics preserved.** Only those two documents change. Method/type counts,
  target declarations, service verdicts, tables, and non-offending lines remain
  byte-identical. On each target line, replace only the exact prohibited token span;
  every prefix/suffix byte remains fixed. Freeze quantities 33, 8, ten, and zero;
  permitted backticked inventory names; `assembleSession`; and table delimiters.
- **AC-V3 — No guard gaming.** Guard, allowlists, patterns, scripts, product, tests,
  census, packages, and locks remain frozen.
- **AC-V4 — Gate advances.** `npm run harness-vocab-guard:check` exits zero and
  `npm run verify:release` passes this phase, recording immediate next phase
  `ah5-mock-guard:check` and its exit/result.

## Technical task tree

#### `pin-vocabulary-drift`
- **Kind:** implementation
- **Owns:** `file:.pipeline/work/AU20/probes/validate-harness-vocabulary-evidence.mjs`, `file:.pipeline/work/AU20/red-proofs/harness-vocabulary-evidence.json`
- **Consumes:** guard and two offending documents
- **ACs:** AC-V1, AC-V2, AC-V3
- **Verify:** validator exits red only with the exact six legacy-vocabulary lines
- **Parallel:** no

#### `refresh-vocabulary-evidence`
- **Kind:** mechanical
- **Depends on:** `pin-vocabulary-drift`
- **Owns:** `file:.pipeline/work/AU20/analysis/services/context-assembly.md`, `file:.pipeline/work/AU20/rearch/run-orchestration.md`
- **Consumes:** accepted frozen validator/proof
- **ACs:** AC-V2, AC-V3, AC-V4
- **Verify:** validator and vocabulary guard green; release reaches next phase
- **Parallel:** no

## Contracts

No runtime/public contract changes. This is a terminology-only documentation
correction. The validator must compare exact replacement spans and reject any other
target-line byte or non-target-line change.

## Security and abuse

Documentation only. Rate limiting, input trust, secrets, path traversal, SSRF, and
state-changing endpoints are N/A.
