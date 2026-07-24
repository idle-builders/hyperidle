# AU20 F10 filesystems watcher implementation review

Date: 2026-07-24
Reviewer: independent pipeline-reviewer

## Bound inputs

| Input | SHA-256 |
|---|---|
| Completeness contract | `1654df58905d14917d97e709f6e7e136d4f512b0b722386e59f40c95b6f841ac` |
| RED proof | `b17c8bdbd28e79ad09dd9a5c950aa0bbf6137e37a963caa896b9d12849d4aed0` |
| Corrected RED review | `a871298edba1c30af90185b65429abc60044c81f9fd3104a608b0bf14be35fbb` |
| `file-watcher.ts` candidate | `0742250e1accab2d2ee5977cd9a3bcbcd3571385d9bc792d2ede9247965c9745` |
| run-orchestration `context.ts` candidate | `f90c8db93beb4a0c0f5db7e64a77ba89ab061b59ba1ea785bfe49f64dd143899` |
| `server-factory.ts` candidate | `85c44c324ab10aa63027a220fe7a99a394deba59c35cc9226102f7d32896ab8b` |

## Strict findings

No critical, warning, or observation.

- `FileWatcherConfig` gains the required callback without adding a method or
  type declaration.
- A later `fs.watch` setup throw cancels state, closes every already-open
  watcher, and rethrows the original error synchronously.
- The first runtime error marks the handle stopped before cleanup, cancels its
  timer, clears pending changes, closes every watcher, and calls `onError`
  exactly once. Later errors, changes, timer advancement, and repeated
  `stop()` remain silent and idempotent.
- Run orchestration forwards the callback through its existing internal port,
  logs the error with `sessionId` and `sandboxPath` through the existing
  structured logger, and stops ingestion exactly once.
- `server-factory.ts` removes the fake empty context override, allowing
  `runtimeDeps` to retain its real production context/provisioner ports. This
  is the disclosed, planner-authorized change inside the original F10
  three-path scope; no other product drift exists.
- Product diff is 61 insertions / 12 deletions across exactly the three
  authorized paths. No gate or census script changed.

## Acceptance audit

| Contract | Verdict | Evidence |
|---|---|---|
| Partial setup rollback and observable throw | PASS | Focused integration |
| First runtime error closes/cancels/clears and notifies once | PASS | Focused integration |
| Later silence and idempotent stop | PASS | Focused integration |
| Contextual orchestration logging and stop | PASS | Focused integration |
| Real production composition path retained | PASS | Candidate inspection and repository check |
| Normal watcher behavior retained | PASS | Focused integration: 8/8 |
| Check, lint, unit | PASS | 37 packages; lint exit 0; 356 files / 3,561 tests |
| Corrective gate | PASS | 604 identities; 181 diagnosed; 0 unresolved |
| Surface invariant | PASS | 23 services / 231 methods / 181 types |

VERDICT: accept
