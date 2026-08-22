# AU44 — where this stands, and how to pick it up

Written when the pass was interrupted mid-flight. Everything below is verified against the worktrees,
not read off an agent report. **Read this before touching anything.**

## The one-line state

Three of nine batches are merged and the consolidation branch is green. Batches 1, 4 and 5 have real
work committed on their own branches and are unfinished. Nothing is uncommitted anywhere; every branch
is pushed.

## Branches

| Branch | State |
|---|---|
| `pipeline/AU44-consolidate` | The PR branch — [PR #507](https://github.com/ambrovia/hyperidle/pull/507) against `main`. Batches 0, 3 and 2 merged. Green: check 0, lint 0, knip 0, knip:production 0, integration 0 (292 files), test:full at the 2-file baseline. |
| `pipeline/AU44` | Carries the audit evidence. Not for merging. Also present on the consolidation branch until the pass ends. |
| `merge/AU44-batch1` | Org and identity. 9 commits, the last a WIP snapshot taken at the interrupt — **it may not typecheck**. |
| `merge/AU44-batch4` | Review/knowledge/conversation/notifications. 5 commits, last a WIP snapshot — **may not typecheck**. |
| `merge/AU44-batch5` | Harness seam. 2 commits, clean tree, no WIP commit. |

The two WIP commits are snapshots taken to avoid losing work, not finished states. Inspect before
building on them.

## Batches: done

- **0 — Close the delete list.** 10 symbols deleted, 22 recorded as surviving with reasons, 32
  convictions confirmed already satisfied by unexporting, 3 notification adapter rows moved to batch 4.
- **3 — Work, routine, session requests.** `framework/cron` dissolved into `routine`; the session-start
  and task-run resolvers collapsed into one discriminated resolver; `updateBetField` folded into the
  bets route. Reviewed.
- **2 — Filesystems, mounting, connections, credentials, settings.** Three packages dissolved:
  `filesystem-contract` into `filesystems` with its types inlined rather than relocated,
  `credential-access` into `credentials`, `filesystem-mounting` into `run-orchestration`. Reviewed.

## Batches: in flight

- **1 — Org, identity, the teams table.** The `team_members` → `teams` fold is done, migration proven
  both ways, replacement governance companion attacks written and passing. Two things were outstanding
  when it stopped: the dead `MEMBERS_ID` export in `tools/setup/src/demo-world/ids.ts` (knip exits 1
  on it), and **eleven e2e specs still seed the dropped `teamMembers` table** — AG1, AG2, AG6, AH4×2,
  AI4, AZ2, R9, navigation, page-layout, known-pre-existing-failures. Its last message claimed all six
  gates green and it was about to run e2e; that claim is unverified. The WIP commit likely holds
  partial e2e seed fixes.
- **4 — Review, knowledge, conversation, notifications.** Review-item creation moved into `knowledge`,
  and the knowledge and conversation rows are committed. Notifications rows and the two door folds
  (`GET /api/knowledge/search` into `GET /api/search`; `POST /api/threads/scaffold` into
  `POST /api/threads/`) were not reached. It has already merged the current consolidation into itself.
- **5 — The harness seam.** `tool-protocol` dissolved and `harness-protocol` shed five modules. The
  `harness-registry` rows, the `HarnessCapabilities`/`HarnessRuntimeCapabilities` de-duplication and
  the `event-bus` devDependency respell were not reached. No gates run yet.

## Batches not started

6 — host and run substrate. 7 — the UI substrate. 8 — the shared type spine.
Their scope is in `batch-plan.md` alongside this file.

## Things a new session must know

**Merge conflicts are guaranteed and always resolve the same way.** Every batch that deletes a package
edits the same registry files: `tsconfig.json`, `tsconfig.base.json`, `knip.json`,
`tools/governance/decided-rules.json`, `tools/governance/architecture.json`,
`tools/repo-gates/src/typecheck-gate.ts`, `framework/db/src/__tests__/governance-model.test.ts`, and
`package-lock.json`. The resolution is always the **union of the deletions** — never either side alone.
`decided-rules.json` totals and the `governance-model.test.ts` counts must be **recomputed from the
surviving rows**, not carried across. The set currently holds **183 rows: production 99 allowed / 84
forbidden, development 175 allowed / 8 forbidden.** Regenerate `package-lock.json` with `npm install`
rather than merging it by hand.

**Node 24 is required.** `export PATH=/opt/homebrew/opt/node@24/bin:$PATH`. The default shell node is
v22 and writes a lockfile full of phantom errors.

**Read the failed FILE count, not the failed test count.** A file that fails to load runs zero tests, so
a broken build reports the same "2 failures" as a healthy branch. One batch shipped thirteen non-loading
files behind a clean-looking test count. Baseline on the consolidation branch is **2 files / 2 tests**
(`file-watcher.test.ts`, `filesystem-provisioning.test.ts`), both failing identically on untouched
`main`.

**Six gates, not four.** check, lint, test:full, test:integration:service, knip, knip:production. knip
was added mid-pass after two batches deleted packages and left dangling workspace entries that every
other gate passed over.

**Deleting a package means deleting every mention of it** — imports, the root `tsconfig.json`
`references` array, `tsconfig.base.json` path aliases, `knip.json` workspace entries, dependency
manifests, and the lockfile. One batch broke every desktop test by leaving a single dangling
`references` entry: `applications/desktop/tsconfig.json` extends the root, so the root failing to load
killed the whole desktop suite.

**No gate in the set runs e2e**, and e2e has no CI job by design. A branch can be fully green with the
e2e lane broken — which is exactly batch 1's situation. Use `npm run test:e2e:full`; `npm run test:e2e`
runs an affected slice and can exit 0 having executed nothing.

**Verify every builder report against the worktree.** On this pass, builder reports were wrong more
often than they were right: a migration that could not run, a package duplicated instead of dissolved,
four false green gate claims, a relocation described as a dissolution, and one agent that reported seven
areas of completed work with zero commits. Run `git log --oneline pipeline/AU44-consolidate..HEAD` and
the gates yourself before acting on anything.

## Declared behaviour changes so far

- Patching a non-active bet returns **400** instead of 500 — the old 500 was an invariant throw escaping
  as a server error.
- `WorkIntentInput.bakedRequest` is now required; callers must supply it.

## One production bug this pass found and fixed

`seedAnthropicKeyFromEnv` wrote the env-seeded key under the credential name `anthropic` while every
resolver reads `anthropic_api_key` — a fresh boot with the env var set would have failed at the first
agent run. All six gates passed over it; the reviewer caught it. There is now a test on that path.
