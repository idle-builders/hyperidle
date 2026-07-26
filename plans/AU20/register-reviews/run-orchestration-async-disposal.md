# AU20 run-orchestration async disposal implementation review

Date: 2026-07-24
Reviewer: fresh independent pipeline reviewer
Increment: `run-orchestration-async-disposal`
Finding: F2

## Frozen production hashes

| Path | SHA-256 |
|---|---|
| `packages/core-api/src/server-factory.ts` | `34332d65afb258b47de22e77452f30b29514fa23afcf70ab0b4555d43587fbb1` |
| `packages/remote-server/src/index.ts` | `5268bfa5fbb6ce88c782e7b4658b11c1b6ab57c26a7b73b01006a113ac2517a3` |
| `packages/desktop/src/boot-server.ts` | `5083a235f4b90fe1f609939435fb6e8b887568b6ac924337d5dbe718e7bba2f7` |
| `packages/desktop/src/main.ts` | `97aedbfc49137f79ab4d9d505b4b37c6bfef9646a7d49ecfd698e130172e0118` |
| `packages/web/scripts/ah1-test-server.ts` | `14e14a9a08a4642c7ea6aa19da0b0aa230389036e1b7b3474e3800be052d317e` |
| `packages/web/scripts/ah5-test-server.ts` | `bf47c33bc75275b3c3c83a27e5f6f7c6356a101c072933d283c76be4266d6ff4` |
| `packages/web/scripts/ah6-test-server.ts` | `68699ebe2f01b50e232c4308a7878127bab3d5ab3286aa72fcead8e710f97169` |

Frozen RED evidence remains unchanged:

- test: `f136b0f3b544070a92dd9cc63a9c281de468009b296bcd9dd0d76e6d1b3e94f3`
- proof: `56256c3bf8e74894df90115ca873f671c87c212ae3424debd7b0383fa330987b`
- RED review: `a2634e280fe73c730d80b0c19e93871eee2ba883dafc9380c18bd1f12bab64fc`

## Product review

The F2 product implementation is accepted.

- Exactly seven authorized production paths changed.
- `dispose()` returns one shared `Promise<void>`.
- All six shutdown phases execute exactly once in required order.
- Failures do not stop later cleanup; rejection is one ordered,
  phase-tagged `AggregateError`.
- Injected databases remain open. Owned database close is awaited after
  durable runtime shutdown.
- All six production callers use one-shot asynchronous signal/quit handling.
- No new export or service-surface growth occurred.
- Authorized production diff is 138 additions and 54 deletions.

## Blocking gate finding

The implementation cannot be accepted as a green increment because the
mandatory reviewed-map validator exits 1 with `F5 final review binding
mismatch`.

This is a stale provenance-gate defect, not an F2 product defect. Completed
F5 history validates its final-review hash against the current working-tree
`server-factory.ts`; F2 is explicitly authorized to change that file. The
completed-history check must validate F5's committed blob/receipt, while F2
binds the current live file independently.

## Commands observed

- Focused F2 service integration → exit 0; 5/5 tests pass.
- Desktop unit project → exit 0; 9 files and 123 tests pass.
- `npm run check` → exit 0; all 37 packages pass.
- `npm run lint` → exit 0.
- `npx tsx scripts/surface-census.ts --json` → exit 0; 23 services,
  231 methods, 181 types, 412 total.
- `git diff --check` → exit 0.
- `node .pipeline/work/AU20/probes/validate-corrective-change-map.mjs --require-review`
  → exit 1; stale F5 final-review binding mismatch.

VERDICT: revise
