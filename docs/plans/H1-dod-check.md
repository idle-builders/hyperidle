# H1 — Git Export Routine: Definition of Done Audit

Auditor: QA Engineer (independent)
Date: 2026-04-18
Worktree: `/workspace/.worktrees/H1`
Spec: `docs/work-packages/TRACK-H.md` §H1

## Test evidence

- `bun run test packages/server/src/__tests__/git-export` — **108 passed / 0 failed**
  - `git-export.test.ts` (73 tests)
  - `git-export.integration.test.ts` (12 tests, real `git` CLI)
  - `git-export-routes.test.ts` (23 tests)
- `bun run check` — clean (zero type errors)
- `bun run lint` — **4 errors + 61 warnings**, **all unrelated to H1** (packages/pipeline, packages/fabric, packages/db pg-schema test, packages/web). No H1-authored source or test file triggers lint.

## Acceptance criteria

### AC1 — Human edit to L4 PRINCIPLES → Git export runs, commits new PRINCIPLES.md

**Verdict: PASS**

- `git-export.test.ts:691-710` — "commits changed files and returns {status:'committed'} when no remote is configured (AC1)" — asserts `result.status === "committed"` AND `fs.files.get(${REPO}/factory/PRINCIPLES.md) === "# Principles\n"` AND ordering of `add`→`commit` in runner calls.
- `git-export.integration.test.ts:181-200` — "AC1: edit L4 PRINCIPLES -> export runs -> commit with correct file content" — real `git`: asserts file exists at `factory/PRINCIPLES.md`, body byte-equal, and `rev-list --count HEAD === 1`.
- `git-export.test.ts:1116-1155` — "createApp -> git-export wiring (AC1 production path)" — proves `knowledge_updated` event through `createApp()` reaches the runner factory: `factoryCalls === [REPO]` and `runner.calls.filter(c => c.cmd === "commit").length === 1`.
- Wiring confirmed in `app.ts:98-101`: `registerGitExportHandler(db, eventBus, { runnerFactory: options.gitRunnerFactory ?? ((repoPath) => createGitRunner(repoPath)) })`.

### AC2 — Commit message includes which items changed

**Verdict: PASS**

- `git-export.test.ts:483-538` — `buildCommitMessage` suite: 4 tests asserting each entry appears as `"{layer} {kind} [{scope}] (v{version}): {title}"`, trigger label included, single-entry shape, layer/kind/scope/version all present.
- `git-export.test.ts:712-726` — runs export with 2 seeded items (L4 PRINCIPLES + L2 BRIEF), asserts commit call's `message` contains `"L4 PRINCIPLES"` AND `"L2 BRIEF"`.
- `git-export.integration.test.ts:202-212` — real git: `git log -1 --pretty=format:"%B"` contains `"L4 PRINCIPLES [factory]"`.

### AC3 — No commit if no changes since last export

**Verdict: PASS**

- `git-export.test.ts:680-689` — asserts `{status:'noop', reason:'no-changes'}` when pre-populated fs contains byte-equal content and runner reports `diffClean: true`.
- `git-export.integration.test.ts:214-228` — real git: export twice, second returns `status:"noop"` and commit count unchanged.
- `git-export.integration.test.ts:230-247` — negative: second export WITH new item DOES create new commit (proves noop isn't stuck). Commit count goes 1 → 2.

### AC4 — Exported markdown matches item body exactly

**Verdict: PASS**

- `git-export.test.ts:616-621` — unit: `entry.body === body` byte-for-byte with unicode, emoji, trailing newline.
- `git-export.integration.test.ts:249-260` — real git: body with YAML frontmatter, tabs, trailing newline — `fs.readFileSync` byte-equal.
- `git-export.integration.test.ts:282-313` — real git: 10k+ line unicode body through REFLECTION path — byte-equal.
- `git-export.test.ts:916-940` — deletion path: stale files `products/ghost/BRIEF.md` + `factory/FOCUS.md` get deleted; `result.filesDeleted` contains both; fs no longer has them. Integration counterpart at `git-export.integration.test.ts:329-349` (archived item → `filesDeleted` contains `factory/PRINCIPLES.md`, file gone on disk).

### AC5 — Configurable: repo path, remote URL, branch

**Verdict: PASS**

- `loadGitExportConfig` unit suite (lines 258-322) covers all three: custom repoPath, custom remoteUrl, custom branch (`"docs"`).
- `git-export.test.ts:859-872` — honors custom branch: push call's `branch === "docs"`.
- `git-export.test.ts:874-882` — honors custom repoPath: fs wrote to `/tmp/h1-custom-location/factory/PRINCIPLES.md`.
- `git-export.test.ts:728-737` — remote configured → `status === "pushed"` and `push` call recorded.
- `git-export.integration.test.ts:262-280` — real git with `branch: "docs"`: `git symbolic-ref HEAD` returns `refs/heads/docs`, `git remote -v` contains the configured `file://` remote.

## Contract invariants

### L2 mapping (BRIEF.md, ARCHITECTURE.md, BRAND.md, PRINCIPLES.md per product)

**Verdict: PASS** — `git-export.test.ts:563-576` asserts all four L2 kinds produce `products/nimmly/{BRIEF,ARCHITECTURE,BRAND,PRINCIPLES}.md`.

### L4 mapping (PRINCIPLES.md, FOCUS.md, PORTFOLIO.md, REFLECTIONS/ per factory)

**Verdict: WEAK** — PRINCIPLES and REFLECTION (with topic) have explicit mapping tests (`git-export.test.ts:547-561, 578-591`). FOCUS is only exercised through the deletion path. PORTFOLIO has no explicit mapping test. `EXPORTED_KINDS` whitelist includes both, and the `factory/${kind}.md` branch is symmetric with PRINCIPLES, so behavior is correct by construction — but a dedicated positive assertion for FOCUS and PORTFOLIO would tighten the proof. Not a blocker.

### Git push on remote configured

**Verdict: PASS** — covered by unit (`:728-737`) + integration (`:262-280`) + push-failure path (`:428-455`) which proves push failures are classified as `phase:"push"` with `last_commit` stamps written but `last_push_at` absent.

### Status filter (captured/provisional/needs_human/archived/stale NOT exported)

**Verdict: PASS** — `git-export.test.ts:623-635` seeds items in all five forbidden states plus `active` and `validated`, asserts only `active` + `validated` bodies land in the plan. Enforced at SQL layer via `inArray(EXPORTED_STATUSES)` + belt-and-braces `notInArray(...)` in `computeExportPlan` (`git-export.ts:188-201`).

### Deletion handling (archived items removed from repo)

**Verdict: PASS** — `git-export.integration.test.ts:329-349` (real git): seed PRINCIPLES, export, archive, export again — `filesDeleted` contains `factory/PRINCIPLES.md` and file no longer on disk. Unit counterpart at `:916-940`. Non-managed paths (README.md, LICENSE) are not deleted (`:942-955`).

### Security — path traversal, userinfo in remoteUrl, `/etc` rejection

**Verdict: PASS**
- `sanitizePathSegment` rejects `..`, `.`, leading-dot, separators, NUL, Windows reserved names (`git-export.test.ts:324-358`).
- `computeExportPlan` actively rejects evil `scopeId` values (`../../etc`, `../root/.ssh`) and puts them in `plan.rejected` (`:637-662`).
- `sanitizeRemoteUrl` rejects userinfo on https/ssh, `ext::`, `file://` by default, leading `-`, embedded CR/LF (`:393-437`).
- `redactRemoteUrl` strips credentials on GET /config + /status responses — route tests `git-export-routes.test.ts:196-209, 516-525` verify `ghp_secrettoken` never leaves the process.
- `sanitizeRepoPath` rejects `/etc`, `/root`, `/proc`, `/sys`, `/dev`, `/boot` and `..` traversals (`:360-391`), and `loadGitExportConfig` re-validates at load time — `:274-280` asserts stored `/etc/ha` returns null config.

## Overall outcome

**READY TO SHIP.**

All five acceptance criteria are proven by explicit tests that assert behavior (file contents, commit counts, exit states), not just truthy returns. Integration tests exercise real `git`, not just the fake runner. Security review issues raised in prior passes (userinfo redaction, `/etc` denial, `sanitizePathSegment` hardening) are covered by new regression tests. Production wiring in `app.ts` is verified by a dedicated test (`createApp -> git-export wiring`). The one WEAK item (no explicit positive mapping test for L4 FOCUS / PORTFOLIO) is behavior-correct by construction — acceptable for v1, good candidate for a follow-up hardening commit.
