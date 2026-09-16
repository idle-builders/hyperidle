# BA5 phase 2 (Google Drive through rclone) — review

Diff `6bb547076..b54203491`, ten commits, against `architecture-phase2.md` (rev. 2026-09-16),
`architecture-no-teardown.md`, `plan.md`. Read-only; every claim below was re-tested, not taken.

## Verdict: fix list — 2 blocking, both cheap. Production code itself is correct.

## Findings

| # | Sev | Where | Evidence | Fix |
|---|---|---|---|---|
| 1 | **BLOCKING** | `layers/agent-orchestration/run-orchestration/src/__tests__/drive-folder-adapter.integration.test.ts`, `rclone-runner.integration.test.ts` | Nothing asserts the runner's argv. Swap `copy`→`sync` at `layers/agent-orchestration/src/rclone-runner.ts:163`, or delete `--drive-skip-gdocs`, and all 9 real-rclone tests, all 21 drive unit tests and the whole service lane stay green. V6 case 2 (`--update`) can't see it: source and dest hold the same one file, so `sync` deletes nothing. V6 case 3 calls `execFileSync("rclone", …)` directly (`:208`), bypassing the runner's verb entirely. V1 case "`--drive-skip-gdocs` accepted against a local backend" passes with the flag removed — the local backend ignores drive flags. Design §9.2 V6's own *Red if reverted* column claims "`copy` swapped for `sync`" goes red. It does not. The two hardest standing rules (copy-only; gdocs excluded) have zero red signal. | One argv-recording test: temp dir first on `PATH` holding an executable `rclone` that appends `"$@"` to a file; call `copyDown("r","p","/d")`; assert the recorded argv is exactly `copy r:p /d --drive-skip-gdocs -u --ask-password=false`. Goes red on the verb swap, the dropped flag, and a reversed direction. |
| 2 | **BLOCKING** | `layers/agent-orchestration/run-orchestration/src/mounter.ts:131` | `* (§2.1), so this is never reached by a valid code/doc_set/drive row.` — a plain (non-`@lore`) comment pointing at `.pipeline/work/BA5/architecture-phase2.md` §2.1. Newly added by `cbda4dd5a`, in the same diff whose first commit (`47a2499c5`) exists to delete exactly this shape. | Drop the parenthetical: `Selection now runs on resourceRef.kind, so this is never reached…`. |
| 3 | should-fix | `docs/architecture/as-implemented-domain-architecture.md:324` | `Tables in framework/db/src/schema.ts: filesystems, filesystem_injections, filesystem_captures, …` — `filesystem_captures` was dropped by migration `0057_AU43_drop_five_tables.sql:37`. | Delete `filesystem_captures` from the list. |
| 4 | should-fix | `docs/guides/developer/getting-started.md:83` | `│   ├── filesystem-contract/   # The Filesystem vocabulary and its mount, auth and capture seams` — the package was dissolved (AU44 b2); "capture" is gone. | Remove the row, or repoint at `layers/agent-orchestration/filesystems/`. |
| 5 | should-fix | `docs/architecture/connection-model.md:79` | Names `filesystem-reachability.ts` and `ServiceConnectionResolverAdapter`; neither exists (`rg` finds zero). §10's "no Drive edit needed" is correct — Drive creates no connection — but the file still lies about phase 1. | Repoint at `service-connection-resolver.ts`; drop "filesystem reachability probes (AO1)". |
| 6 | should-fix | harness lane | `progress.json:464` records the release-checklist harness run at `f88b714346`, i.e. **before** D3. Phase 2 changed `mounter.ts` and `provisioner.ts` — session provisioning — which re-triggers the obligation in `.claude/rules/testing.md`. | Re-run `npm run test:integration:harness` at `b54203491` before ship; compare against main (it is red on main for pre-existing harness-registry reasons). |
| 7 | should-fix | `layers/agent-orchestration/src/rclone-runner.ts:65-67` | `logger.info("rclone spawn", { args, … })` logs `args` **before** `--ask-password=false` is appended at `:67`, so the log line misstates the argv actually executed. Confirmed in the live V6 run output. | Build the final array first, log that. |
| 8 | note | `layers/agent-orchestration/src/redact-secrets.ts:26-29` | Reason 5 persists rclone stderr into `attention_reason` (DB + UI). Redaction strips URL-userinfo and `gh[pousr]_…` only; a Google token shape (`ya29.…`, `1//0…`) would pass through verbatim. We never hand rclone a secret, and ETHOS says security is earned — recording, not asking. | — |
| 9 | note | `layers/agent-orchestration/run-orchestration/src/mounter.ts:355-366` | `mkdirSync` + the full `copyDown` (600 s ceiling) run **before** the link-collision check, so a workspace collision costs an entire copy first. Matches design §2.2's own pseudo-code order. | — |
| 10 | note | `layers/agent-orchestration/run-orchestration/src/mounter.ts:333-340` | Selection moved from `filesystem.kind` to `resourceRef.kind`, so a legacy `doc_set` row with `source` `gdrive`/`dropbox`/`s3` would now reach `LocalFolderAdapter` instead of refusing. `deriveSource` never produced those values and there are zero active deployments, so no such row can exist. Scan confirms `CLOUD_SOURCES`, `dropbox`, `s3` are gone from code (one prose mention left at `mounter.ts:403`, inside `@lore`). | — |
| 11 | note | `layers/core-ui/src/settings/SettingsFilesystems.tsx:290` | The new setup paragraph copies the pre-existing double space in `className="type-metadata  text-[var(--text-tertiary)]"`. | — |
| 12 | note | `layers/agent-orchestration/run-orchestration/src/mounter.ts:8` | `@lore` block says "see BA5 §5 **below** for the current shape"; the file has no §5. Exempt from the id rule (inside `@lore`), but the pointer is dead. | — |

## Comment hygiene — the 44-line grep, classified

The builder's `git diff origin/main` grep returns 44 lines, but `origin/main` has moved (`f49720426`); 26 of
those belong to other packages (AU21/AU26/AU31/AU44) and are not this branch's. Against the real merge-base
`286628f7b` the branch adds **18** such lines. **17 are continuation lines inside `@lore` blocks** — acceptable.
**One is a plain comment: `mounter.ts:131` (finding 2).**

## Claims tested — what holds

- **argv.** Live V6 log: `["copy","v6remote:<path>","<dest>","--drive-skip-gdocs","-u"]`, plus
  `--ask-password=false` appended in `spawnRclone`. No `--config` anywhere in the runner; tests steer rclone
  only by stubbing `HOME`/`XDG_CONFIG_HOME` on `process.env`, which production forwards — so no test-only
  production code and no path that touches the global config. `~/.config/rclone/rclone.conf` untouched.
- **Injection closed.** `routes/filesystems.ts:186` — `REMOTE_NAME` *and* an explicit `remote.startsWith("-")`
  (the regex alone allows a leading `-`, so the extra check is load-bearing, not belt-and-braces); newline/NUL
  rejected on `path` at `:189`. V4 proves both with 400s.
- **No copy-back by HyperIdle.** `rg` for `sync|bisync|move|copyto` beside rclone in production: nothing. The
  only three verbs are `listremotes`, `lsjson --stat`, `copy` remote→local. The way out is the agent's own
  command in the instructions, and V6 case 3 proves that exact command works through the symlink root.
- **Check reuses phase 1, no second mechanism.** Drive branch dispatches first in `filesystem-check.ts:142`;
  wired into registration and `POST /:id/check` (`routes/filesystems.ts:218`), admission Phase 4.5
  (`provisioner.ts:1276`) and `boot.ts:339`. `FilesystemCheckDeps.rclone` is **required**, so no caller can
  silently skip it. V5's new Drive case in `filesystem-hold-task-stays-ready.integration.test.ts` lands on the
  same generic `FilesystemMountFailure` path: task `accepted`, request back to `pending`, no `sessions` row,
  state `needs_attention`, **one** event. V4 proves the once-per-episode rule survives a second Check, and the
  label is `gdrive:Projects/Acme`, not a UUID.
- **Reason strings** match §4.2 1-6 exactly (`drive-reason.ts`), shared by Check and the adapter. V2 covers all
  six plus a real ordering assertion (`statPath` never runs for an unconfigured remote).
- **Placement / no teardown.** Kept copy at `<keptCopiesRoot>/<filesystemId>`, `mkdirSync` before the copy,
  refresh on every mount, symlink in, `trustedPaths:[copy]`, `agentEnv:{}`, no `unmount`. Second session and
  resume both proven. `forgetKeptCopy` extended to `drive` and still refuses a local repo and a person's own
  folder; its one caller is `DELETE /api/filesystems/:id`.
- **Schema.** No new SQL; the `framework/db/drizzle/` diff is empty and `schema.ts`'s diff is comment-only.
  `resourceRef {kind:"drive",remote,path}` validated by `driveRefSchema`; `deriveSource` → `"gdrive"`;
  `kind` stays the closed two-value enum, `doc_set` on the wire.
- **Dialog.** Only Remote + Folder-in-Drive; Branch and the GitHub-token Select hidden; setup line present;
  `connectionId` always null for Drive; `inspect-path` unreachable. Stories carry a populated Drive
  `needs_attention` row. Six component tests green.
- **Deviations, each judged sound.** `drive-reason.ts` as a third file (avoids a real check↔mounter cycle) —
  accept. `CloudNotBuiltAdapter` → `UnsupportedFilesystemAdapter` — design §7 delegated the name — accept.
  knip `ignoreBinaries` + the `require-binary.ts` entry, and the census `metadata: 205 → 207` — both gates green,
  both counts correct — accept. V4's `agentIds: []` (registration Checks before any injection exists) is the
  achievable ordering and is documented in the test; the injected case is covered by V5 — accept. The
  leading-`-` check — accept, it closes a gap the design's own regex left open.
- **Size.** 568 added / 117 deleted production lines (the builder's 584/119 includes `.stories.tsx`). Stripping
  comments and blanks: **383** added code lines, under the design's ~465. The gap is `@lore` and doc comments,
  not product code. No scope overrun in either direction.

## Gate exit codes (verbatim, `PATH=/opt/homebrew/opt/node@24/bin:$PATH`)

| Command | Exit |
|---|---|
| `npm run check` | `0` |
| `npm run verify:quick` (check + lint + knip + knip:production + deps:check) | `0` |
| harness project — `rclone-runner.integration.test.ts` + `drive-folder-adapter.integration.test.ts` | `0` — 2 files, 9 tests passed |
| service project — `AO1-filesystems`, `filesystem-hold-task-stays-ready`, `filesystem-check.integration`, `git-repository-adapter` | `0` — 4 files, 64 tests passed |
| service project — `admit-session-live-filesystems.integration.test.ts` | `0` — 4 tests passed |
| unit — `drive-folder-adapter.test.ts`, `filesystem-check.test.ts`, `filesystem-instructions.test.ts` | `0` — 3 files, 21 tests passed |
| `npx vitest run settings-filesystems` | `0` — 6 tests passed |
| `npm run test:integration:harness` | **not run at this head** — see finding 6 |

rclone v1.75.1 was used for the real lane. No Google remote configured; no global rclone config read or written.
