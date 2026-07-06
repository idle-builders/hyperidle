# AV1 — Definition of Done (AC + scenario → verification)

Tests live only in `packages/`, assert runtime behavior through imports (CLAUDE.md).
Naming: `*.test.ts(x)` unit/component, `*.integration.test.ts` real DB/app.
Revised after human-concept-review: primary harness = persisted team default;
Assistant opens ready (auto-open kept); non-installed harnesses greyed (not omitted).

## Acceptance criteria

### AC1 — Onboarding shows ALL harnesses; installed choosable, non-installed greyed
**Method:** component test — `AV1-SetupFlow.harness.test.tsx`. Mock `GET /api/harnesses`
→ descriptors incl. `builtin` (ready), `claude-code` with `discovery.state:"ready"`,
`codex` with `discovery.state:"missing"`. Assert:
- All three rows render (non-installed `codex` is NOT omitted).
- `builtin` + `claude-code` (ready) render as **selectable** choices; built-in is
  default-selected.
- `codex` (missing) renders **greyed/disabled** with an install-hint affordance and
  is NOT selectable (clicking it does not set it as primary).
- The picker is a radiogroup (exactly one primary).
Plus unit `derive-primary-harness.test.ts`: descriptor → `{harnessType, modelId,
modelProvider}`, model selection filters on `.selectable === true` (selectable behind
non-selectable rows is picked; all-non-selectable falls back to `"claude-sonnet-4-6"`).

### AC2 — Primary harness persists as team default; EVERY creation path consumes it
This is the founder's core override — verified at the onboarding path AND the
add-agent-later path.
**Method:** integration test — `AV1-primary-harness-default.integration.test.ts`
(real DB/app).
- **Persist + first roster:** run the onboarding request sequence with
  `primaryHarness={harnessType:"claude-code", modelId:..., modelProvider:...}`. Assert
  (a) the `teams` row carries `defaultHarnessType:"claude-code"` (+ model/provider);
  (b) the scaffolded team agents report `harnessType:"claude-code"`.
- **Add-agent-later inherits the persisted default:** after that team exists, POST
  `/api/teams/:teamId/agents {role}` with NO harness in the body. Assert the newly
  added agent reports `harnessType:"claude-code"` (read the persisted team default),
  NOT `builtin`. This proves consumption at `teams-routes.ts:663` — the path the prior
  plan left omitting the primary.
- **Unset default → builtin fallback:** create a team with NO `primaryHarness`; assert
  `teams.defaultHarnessType` is null AND scaffolded + later-added agents fall back to
  `harnessType:"builtin"`, `modelId:"claude-sonnet-4-6"`.
Backed by unit `team-default-harness.test.ts` (`resolveTeamAgentHarness`: explicit
wins; team default used when no explicit; `undefined` when both unset).

### AC3 — Folder registered as filesystem with detected branch; empty-branch degrades, never 400s
**Method:** integration test — `AV1-onboarding-filesystem.integration.test.ts`.
- **Git repo on a known branch** (real `git init` + commit): inspect-path + team-create
  + register; assert `GET /api/filesystems?teamId=<team.id>` returns one fs with
  `kind:"code"`, `resourceRef.repo=<path>`, `resourceRef.branch=<branch>`,
  **`writeback:"none"`**.
- **Non-git folder** → `kind:"doc_set"` with `resourceRef.folder`, no branch,
  `writeback:"none"`.
- **Git repo NO resolvable branch** (real `git init`, zero commits →
  `currentBranch()` `null`): the register call MUST NOT send `kind:"code"` with an
  empty branch (server `codeRefSchema.branch.min(1)` would 400). Assert it registers
  as `kind:"doc_set"` and `GET /api/filesystems` returns it (no 400, no swallowed
  fs). This is the empty-branch fix.
Backed by unit `inspect-local-path.test.ts` (`createFakeGitRunner`: git output →
branch; empty/`"HEAD"`/failure → `branch:null`; non-git → `isGitRepo:false`) +
`inspect-local-path.integration.test.ts` (real git incl. no-commit repo) +
`git-export-runner.integration.test.ts` direct coverage for `currentBranch()`
(committed → branch string; no-commit → `null`).

**Static (writeback default):** onboarding register calls pass the literal
`writeback:"none"`; `WRITEBACK_MODES[0]` is `"git"` (must NOT be used). Verified by
the AC3 runtime assertions on `writeback:"none"` (not by reading source).

### AC4 — After onboarding the Assistant opens READY (no missing_key / missing_harness burst)
The founder KEEPS the auto-open; readiness (not removal) is the fix. Notices are
server-produced on a failed first turn (`assistant-turn.ts:161-210`); the AC proves
the turn does NOT fail on misconfiguration.
**Method (4a — the readiness fix):** integration test —
`AV1-assistant-ready.integration.test.ts` (real DB/app).
- Run the onboarding sequence: create user → create team with `primaryHarness` →
  `PUT /api/credentials/anthropic_api_key`. Then trigger the Assistant's first turn
  (post a human message to `thr-ast-<userId>` / invoke the assistant-turn path with a
  cassette/replay for the model call).
- Assert **no `missing_key` and no `missing_harness` notice** is persisted on the
  assistant thread (query messages for `payload.notice.kind`). The turn instead
  produces a normal reply (or the replay cassette's reply).
- **Sanity-break (required):** clear the assistant row's `harnessType` (set null) and
  re-run the turn → a `missing_harness` notice IS persisted. This proves the assertion
  is meaningful (the harness the stub carries is what suppresses the card), not
  trivially green.
- Assert the onboarding assistant stub row (`ast-<userId>`) carries a non-null
  `harnessType` equal to the persisted team default (or `builtin` when unset).
**Method (4b — key precedes nav / auto-open kept):** component test — folded into
`AV1-SetupFlow.harness.test.tsx` or a small `AV1-setup-order.test.tsx`:
- Assert the submit sequence awaits the `PUT /api/credentials/anthropic_api_key`
  BEFORE calling `navigate("/work?onboarding=true")` (the ordering that guarantees
  the key is live when the overlay auto-opens and fires the first turn).
- Assert the success nav target is `/work?onboarding=true` (auto-open KEPT).

**KEEP (reverted from prior plan) — do NOT delete or rewrite these:**
- `AE2-onboarding-autoopen.test.tsx` — kept in full (both auto-open positives + both
  negatives). The prior plan's deletion of the two positives is reverted.
- `AE2-SetupFlow.test.tsx` nav test — kept asserting `/work?onboarding=true`. The
  prior plan's rewrite to `/work` (no param) is reverted.

### AC5 — Setup completes with zero external harnesses (graceful degrade)
**Method:** component test (folded into `AV1-SetupFlow.harness.test.tsx`): mock
`GET /api/harnesses` to reject / return builtin-only; assert the picker collapses to
built-in choosable (any greyed rows still render if the mock includes missing
descriptors, but none block), "Start HyperIdle" is enabled once name+key are filled,
and the submitted `POST /api/teams` body omits `primaryHarness`. Confirms discovery
never gates setup and the unset-default builtin fallback (AC2 case 3) holds.

### AC6 — (Robustness invariant) Fresh team enqueues no health notifications
**Method:** integration test — `AV1-fresh-team-no-notification.integration.test.ts`.
Create a team, `GET /api/teams/:id`, assert zero `agent.health.degraded` rows for the
new (zero-session) agents.
- **Sanity-break (required):** a team with a crashed-session agent DOES enqueue an
  `agent.health.degraded` row. Both assertions live in this test.
- **Honesty note:** a zero-session agent is already `idle` (never `error`), so the
  guard at `teams-routes.ts:842` (gate on `agentSessions.length > 0`) is a robustness
  invariant, NOT the burst fix. The burst fix is AC4. This AC's value is "never-run ⇒
  never degraded, mechanically pinned."

## Validation scenarios

### VS1 — claude-code installed → agents (incl. later-added) report claude-code + repo branch
Covered by **AC2** (persist + first roster + add-agent-later inherits) + **AC3**
(fs + branch).

### VS2 — no external harness → setup succeeds, builtin/sonnet-4-6 fallback everywhere
Covered by **AC5** (degrade + omit primaryHarness) + **AC2 case 3** (unset default →
builtin on scaffold AND add-agent-later).

### VS3 — first load after onboarding → Assistant opens ready, no notice burst
Covered by **AC4a** (no `missing_key`/`missing_harness` notice; assistant stub carries
a harness) + **AC4b** (key-before-nav ordering; auto-open kept).

### VS4 — non-installed harness discoverable
Covered by **AC1** (codex `state:"missing"` renders greyed with install hint, not
omitted, not selectable).

## Static / build gates (all)
- `npm run check` (types — new `teams` columns, `resolveTeamAgentHarness`,
  `GitRunner.currentBranch()`, route/helper/derive signatures, descriptor mapping).
- `npm run db:generate` produced migration applies clean; `npm run db:migrate` on a
  fresh + on an existing DB (additive nullable → no backfill, no break).
- `npm run lint` (Biome + ESLint + `eslint-plugin-design` on the picker markup — 6px
  grid, warm tokens, no AI-aesthetic tells, greyed-row affordance).
- Design fidelity: paint the SetupFlow harness step (installed choosable + greyed
  rows) + folder-confirm row against a running app (human concept review render).
