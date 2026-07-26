# AU20 final ship-correction architecture review

Date: 2026-07-23
Reviewer: independent pipeline-reviewer, round 4

## Immutable inputs

| Input | SHA-256 |
|---|---|
| `.pipeline/work/AU20/architecture.md` | `105edc1f4f4a9acf01cfdd982b3c5658ec8c4d67c9fd47e5b34f563498c22095` |
| `.pipeline/work/AU20/feasibility.md` | `36ba068829bc0f8f205aff02c3e6fb1871871935bc62ff12647373338b0ae4e7` |
| `plans/AU20/diagnostics/final-ship-review-correction-map.md` | `f1d862d1151a4d2cbb709d76012ba8cf6b91a808d0c854338d101e045a54fa39` |
| `.pipeline/work/AU20/review.md` | `cef525507cfe766356b2084b7d0ba4ba98699835f560dd1b0b2e5b6fa01c683a` |
| `/Users/tg/hyperidle/.worktrees/AU20-review/.pipeline/work/AU20/review.md` | `d5e8f78444cb099d2e7dd736ea178d47ef41aca7c2c87d8cf3b8206b42f3df24` |
| `.pipeline/work/AU20/progress.json` before binding | `0e54e5231153bc12fcd4a62421edefc243ef66a429ed050bd53ee1b0d5c00897` |

## Architecture critique

ARCHITECTURE-SCORE: 8/10 rounds=4 score-line: SA:9 IM:8 LI:8 AC:8 DM:8 N:8 MD:8 FMC:8 S:9 V:8 FE:8

### Findings

No critical finding remains.

- The map accounts for F1–F13 exactly. It treats the review's heading/footer
  mismatch as F13 review-integrity work instead of inventing a product defect.
- The nine bootstrap owners and distinct cleanup effects are explicit.
  Bootstrap custody is independent of the later `ServerHandle` shutdown
  ordering.
- Disposal specifies all six phases, all-phase execution after failure,
  ordered phase-tagged `AggregateError`, shared-promise idempotence, injected
  database ownership, and exact production/test callers including remote
  server, desktop boot/main, and AH1/AH5/AH6 test servers.
- Filesystem runtime failure has one concrete contract:
  required `FileWatcherConfig.onError`, synchronous partial-setup cleanup,
  one-shot runtime notification, cleared ingestion state, and idempotent stop.
- Every correction has a named proof path and literal focused command. The F10
  command selects the service integration project and discovers the existing
  completeness contract. AU9 is separately assigned to the harness project;
  its missing builtin prerequisite remains an explicit failure, never a skip.
  MCP isolation has a named static checker and command in addition to behavior
  tests.
- Protected tests cover lifecycle callers, desktop shutdown, notifications,
  filesystems, retro snapshots, bootstrap ownership, and MCP behavior.
- Leaves are serial, one service/domain per green commit. Evidence/docs leaves
  own no service. Each leaf traverses red/static proof, independent review,
  implementation, strict review, verification, then commit.
- The service census may not exceed 23 services / 231 methods / 181 types.
  Surface growth requires planner adjudication before tests.
- Real-backend E2E is explicitly AU23 scope and cannot be claimed as AU20
  closeout evidence.
- Aggregate closeout is last. Before this review is hash-bound, every build
  stage remains locked; afterward only `review-finding-ledger` write-tests may
  unlock. Product code remains locked.

### Residual execution note

The AU9 harness command currently fails at `requireHarness` when
`OPENROUTER_API_KEY` is absent. This is the already-named external prerequisite
and does not undermine command selection or architecture feasibility. It must
remain red/blocked rather than be skipped or reassigned.

VERDICT: accept
