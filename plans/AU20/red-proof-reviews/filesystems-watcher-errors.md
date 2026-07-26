# AU20 F10 filesystems watcher RED-proof review

Date: 2026-07-24
Reviewer: independent pipeline-reviewer

## Inputs

- Accepted contract: `.pipeline/work/AU20/architecture.md` F10
- Authorization: `.pipeline/work/AU20/progress.json`
- Test: `packages/core-api/filesystems/src/__tests__/filesystems-completeness-contract.integration.test.ts`
- Proof: `.pipeline/work/AU20/red-proofs/filesystems-watcher-errors.json`

## Findings

No critical, warning, or observation.

- The corrected test SHA-256 is
  `1654df58905d14917d97e709f6e7e136d4f512b0b722386e59f40c95b6f841ac`;
  its committed baseline is
  `8343312f95cd61823ca2ac4876af0fe051404759c19166cf607a14cd1d34e986`.
- The original focused service integration was intentionally RED: 3 failed and
  5 passed, with no runner-level error. The three failures independently
  exposed swallowed partial setup failure, absent runtime watcher error
  handling, and absent orchestration failure callback.
- The fixture-only correction adds exactly two required `onError: vi.fn()`
  callbacks. It changes no assertion or expected behavior. The corrected
  focused contract passes 8/8.
- Setup proof opens one watcher, makes the next `fs.watch` throw, and requires
  synchronous rethrow plus closure of the already-open watcher.
- Runtime proof schedules a pending change, emits the first and a later error,
  emits a later change, advances beyond debounce, and calls `stop()` twice. It
  requires one `onError`, closure of both watchers exactly once, no writeback,
  later-event silence, and idempotent stop.
- Orchestration proof imports runtime behavior, captures the watcher config,
  invokes its callback, and requires session/sandbox error logging plus
  one-shot ingestion stop. It adds no exported method or type.
- Existing registry CRUD/filtering, injection uniqueness/deletion, local
  capture/provenance, capture rollback, and normal watcher filtering,
  debounce, flush, and stop remain green.
- The proof now truthfully records the sole product change made after its first
  candidate freeze: authorized `server-factory.ts` changed from `0e813003…` to
  `85c44c32…` to remove the fake context override which shadowed production
  context/provisioner ports. Planner adjudication explicitly authorizes this
  provenance correction and freezes the final three product hashes.
- Filesystems typecheck, Biome, test-naming guard, and corrective-map gate pass.
  Repository check, lint, and all 3,561 unit tests pass. Census remains 23
  services / 231 methods / 181 types.

## AC audit

| Contract | Verdict | Evidence |
|---|---|---|
| Partial setup rollback and synchronous failure | PASS | Dedicated intended RED |
| First runtime error closes/cancels/clears and notifies once | PASS | Dedicated intended RED |
| Later events silent; repeated stop idempotent | PASS | Same runtime RED asserts both |
| Orchestration logs context and stops ingestion | PASS | Dedicated intended RED |
| Normal behavior protected | PASS | Five existing tests green |
| Product provenance truthful; no surface growth | PASS | Adjudication, exact final hashes, and census |

VERDICT: accept
