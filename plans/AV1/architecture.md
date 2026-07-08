# AV1 — Architecture (post human-concept-review)

## Context
Onboarding (`packages/web/src/pages/SetupFlow.tsx`) does users→teams→credential and
navigates to `/work?onboarding=true`. It never calls harness discovery, never lets
the user choose a harness, stores the folder only as `teams.factoryDbPath`
(`teams-routes.ts:405`), and the freshly-created Assistant fires a notice-card burst
on auto-open. The server seam for the harness choice already landed (Cluster B):
`CreateTeamRequest.primaryHarness` → `persistScaffoldedAgents`.

**Founder override (this revision):** the primary harness is not a setup-time stamp —
it is a **persisted default consumed by every agent that is ever created**, stored
"wherever the harness information about what is connected is stored." AV1 adds that
persisted home, wires all agent-creation paths to read it, keeps the Assistant
auto-open but makes it **ready**, and shows non-installed harnesses greyed rather
than omitted.

## Constraints (contracts)
- Reuse `GET /api/harnesses` / `discoverLocalHarnesses` — no second discovery path.
  The route returns ALL registered descriptors (installed or not); the picker renders
  every one and gates choosability on `discovery.state`.
- Reuse `POST /api/filesystems` + `filesystems` table — no new folder model.
- Reuse the existing `GitRunner` / `createGitRunner`
  (`packages/fabric/src/services/git-export-runner.ts`) for **all** git invocation.
- The persisted default rides `teams` (next to the team's other configuration) — no
  new table, no reuse-abuse of `serviceConnections` (AN1, which stores per-user
  external creds, orthogonal).
- Consume the team default through the **single** agent writer
  `persistScaffoldedAgents` and the Assistant creation points — do not scatter a new
  fallback chain across the codebase.
- Never hard-block setup on discovery (degrade to builtin).
- No new notification system.
- Tests only in `packages/`, runtime behavior through imports (CLAUDE.md).

## Plan reconciliation (verified symbols)
- `teams` table — `packages/db/src/schema.ts:17-34`. Columns are all `text`; adding
  three nullable text columns is additive. ✔ **No `default_harness_*` column exists
  today** → migration adds them.
- `CreateTeamRequest.primaryHarness: PrimaryHarnessConfig{harnessType,modelId,modelProvider}`
  — `packages/shared/src/team.ts:123,143`. ✔ exists (the onboarding entry seam).
- `persistScaffoldedAgents(db, teamMembersId, specs, primaryHarness?)` — the SINGLE
  agent writer, `scaffold-agents.ts:87`; fallback `builtin`/`claude-sonnet-4-6`/
  `anthropic` at `:112-114`. ✔.
- `POST /api/teams` destructures + threads `primaryHarness` — `teams-routes.ts:372,
  401-409` (team insert), `:444-449` (scaffold call). ✔. The team insert is where the
  persisted default must also be written.
- Add-agent-later path — `teams-routes.ts:663` calls
  `persistScaffoldedAgents(db, memberGroup.id, specs)` with **no** primary harness.
  ✔ (currently omits — this is the founder's "every agent created" gap #1).
- Assistant creation — TWO points, both currently hardcode/omit the harness:
  - onboarding stub `teams-routes.ts:543-550` inserts `ast-<userId>` with **no
    `harnessType`** (→ `null` → `missing_harness` on open). ✔ (gap #2 — the burst).
  - lazy create `assistant-turn.ts:434-448` hardcodes `harnessType:"builtin"`. ✔.
- `GET /api/harnesses` → `HarnessCapabilityDescriptor[]` — `harnesses.ts:80`;
  `descriptor.discovery.state: "missing"|"installed"|"unauthenticated"|"ready"|
  "unavailable"` (`harness-capability-descriptor.ts:9,72`); `HarnessModelDescriptor.
  selectable:57`. ✔ — returns non-installed descriptors too (state `"missing"`).
- `DbCredentialResolver` reads `serverCredentials` — `server-factory.ts:247`; the
  onboarding key write `PUT /api/credentials/anthropic_api_key`
  (`SetupFlow.tsx:203`, `credentials.ts:192`) persists into that table. ✔ → once
  written, the key is live for the assistant turn (assistant-ready trace §D2).
- `POST /api/filesystems` — `filesystems.ts:154`; `codeRefSchema` requires `repo`
  **and** `branch` both `.min(1)` (`:38-42`); `docSetRefSchema` requires `folder`
  (`:43`). ✔.
- `WRITEBACK_MODES = ["git","file","none"]` — `filesystem.ts:12`; index-0 is `"git"`
  (auto-push-back), NOT a neutral default. ✔.
- `GitRunner` — `git-export-runner.ts:34`; `createGitRunner`:312; wired as
  `gitRunnerFactory` in `server-factory.ts:276`; `createFakeGitRunner`:570;
  `revParseIsInsideWorkTree():383`. **Lacks `currentBranch()`.** ✔.
- Migrations live in `packages/db/drizzle/`; latest on this branch is
  `0041_wet_photon.sql` → next is `0042_*` (Drizzle-generated slug name). ✔.
- Onboarding auto-open effect — `AppShell.tsx:282-294`
  (`searchParams.get("onboarding")==="true"` → open overlay). ✔ — **KEPT** this
  revision.
- AssistantOverlay notice cards `missing_key`/`missing_harness`/`provider_error` —
  `AssistantOverlay.tsx:277,299,318`; notices are **server-produced** in
  `assistant-turn.ts:161-210` (`mapErrorToNotice`) and persisted as a message with
  `payload.notice`. ✔ — the fix is to prevent the turn from *failing*, not to hide
  the card.
- SetupFlow success nav — `SetupFlow.tsx:212` (`navigate("/work?onboarding=true")`).
  ✔ — **KEPT**.

---

## Decision 1 — Primary harness = persisted team default consumed by every agent (RE-ARCHITECTED)

### Persistence home — three new nullable columns on `teams`

**Chosen home: `teams`.** Justification against the founder's "wherever the harness
information about what is connected is stored":
- Harness *discovery* (`discoverLocalHarnesses`) is **runtime-only, not persisted** —
  it re-probes PATH every call (`harnesses.ts`), so it cannot be the durable home.
- `serviceConnections` (AN1, `schema.ts:1313`) is **per-user × service** and stores
  *external held/inherited tool creds* — orthogonal to "which engine a team's agents
  run on." Writing a harness default there would violate AN1's concept (hard-rule 5,
  `schema.ts:1305-1312`).
- Agents are **team-scoped** (`users.teamId` → `teamMembers` → `teams`), and the
  other durable team configuration already lives on `teams` (`factoryDbPath`,
  `functions`, `phase`). `filesystems` (the folder the user connected) are also
  team-scoped (`filesystems.teamId`). So the team **is** the place "harness
  information about what is connected is stored." A team-level default is the home.

Add to `teams` (`schema.ts:17`), all nullable text (additive, matches existing text
columns):
```
defaultHarnessType:    text("default_harness_type"),      // null = unset → builtin fallback
defaultModelId:        text("default_model_id"),
defaultModelProvider:  text("default_model_provider"),
```
Migration: generate with `npm run db:generate` from the schema edit — it emits the
next `packages/db/drizzle/0042_<slug>.sql` (three additive
`ALTER TABLE teams ADD COLUMN ... TEXT;`, nullable, no backfill; existing teams read
`null` → builtin fallback, unchanged behavior). Hand-verify the generated SQL. The
inferred `Team` type (`schema.ts:1203`, `$inferSelect`) picks up the new columns
automatically.

> @lore AV1: primary harness is a PERSISTED team default (teams.default_harness_type
> + model/provider), not a setup-time stamp. Every agent-creation path reads it when
> no explicit harness is passed; unset → builtin/sonnet-4-6 fallback. Home is `teams`
> (agents + filesystems are team-scoped; serviceConnections is per-user external
> creds, orthogonal).

### Write path (onboarding entry) — `POST /api/teams`
`teams-routes.ts` team insert (`:401-409`) additionally writes the default when
`primaryHarness` is present in the body:
```
defaultHarnessType:   primaryHarness?.harnessType   ?? null,
defaultModelId:       primaryHarness?.modelId       ?? null,
defaultModelProvider: primaryHarness?.modelProvider ?? null,
```
The existing scaffold call (`:444-449`) still passes `primaryHarness` so the first
roster is stamped in the same request (no behavior regression). The difference: the
choice is now **also recorded** so later creations inherit it.

### Read path — the fallback resolver `resolveTeamAgentHarness`
One small importable helper (`packages/server/src/services/team-default-harness.ts`):
```
resolveTeamAgentHarness(
  explicit: PrimaryHarnessConfig | undefined,
  team: { defaultHarnessType, defaultModelId, defaultModelProvider },
): PrimaryHarnessConfig | undefined
```
- explicit present → return explicit (unchanged: caller override wins).
- else team.defaultHarnessType present → return
  `{ harnessType, modelId ?? "claude-sonnet-4-6", modelProvider ?? "anthropic" }`.
- else → return `undefined` (lets `persistScaffoldedAgents` apply its builtin
  fallback at `:112-114`). We do NOT duplicate the builtin literals in the resolver —
  the single fallback source stays `persistScaffoldedAgents`.

### Consumption — the exact list of agent-creation paths (all now read the default)
1. **Onboarding team scaffold** — `teams-routes.ts:444-449`. Already passes
   `primaryHarness` (explicit for this request); unchanged, but the value is now also
   persisted (write path above). ✔.
2. **Add-agent-later** — `teams-routes.ts:663`. Currently
   `persistScaffoldedAgents(db, memberGroup.id, specs)` with no harness. Change to
   load the team row (already fetched at `:635` as `team`) and pass
   `resolveTeamAgentHarness(undefined, team)`. Now agents added after setup inherit
   the persisted default. ✔ (was the founder's gap #1).
3. **Assistant — onboarding stub** — `teams-routes.ts:543-550`. Currently inserts
   `ast-<userId>` with no `harnessType`. Change to set `harnessType`/`modelId`/
   `modelProvider` from `resolveTeamAgentHarness(primaryHarness, team)` (falling back
   to `builtin`/`sonnet-4-6`/`anthropic` when unset — the stub is a direct insert, so
   it applies the fallback literals itself since it does not go through
   `persistScaffoldedAgents`). This is what makes the Assistant open **ready** (see
   Decision 2). ✔ (gap #2 — the burst source).
4. **Assistant — lazy create** — `assistant-turn.ts:434`. Currently hardcodes
   `builtin`. Leave as builtin fallback for the *lazy* path (no team in scope there;
   the userId is not team-bound), BUT it is now rarely hit for onboarding because
   path 3 already created the assistant row with the right harness. Documented as the
   safe last-resort default; not a regression.

**Scope containment:** every new read goes through `resolveTeamAgentHarness` +
`persistScaffoldedAgents`'s existing fallback. No third copy of the harness fallback
logic. Bootstrap/seed paths (`factory-bootstrap.ts`) are untouched — they seed system
agents before any team default exists and already carry `builtin` defaults.

## Decision 2 — Assistant opens READY (KEEP auto-open; configure, don't remove)

Founder: *"the agent should open up and be ready for interaction from the user."*
Reverse the prior "drop `?onboarding=true` + delete the auto-open tests" plan. Keep
the auto-open; make the Assistant ready so the auto-opened overlay shows a talkable
assistant, not error cards.

### D1 — What produces the burst (re-traced against code)
The notice cards are **server-produced**: on the Assistant's first turn,
`assistant-turn.ts` resolves model + credential; a failure is mapped by
`mapErrorToNotice` (`:161-210`) to a `missing_key`/`missing_harness`/`provider_error`
notice, persisted as a `payload.notice` message, and rendered by
`AssistantOverlay.tsx:277/299/318`. So the burst is not a UI bug — it is the turn
**failing** because the just-created Assistant has:
- **no harness** (`teams-routes.ts:543` stub omits `harnessType` → `null` →
  `NoEligibleHarnessError` → `missing_harness`), and/or
- **no key** if a turn fires before the key write lands.

### D2 — How the entered key reaches the Assistant so it opens ready (traced)
- SetupFlow writes the key **before** navigating:
  `PUT /api/credentials/anthropic_api_key` (`SetupFlow.tsx:203`) → `credentials.ts:192`
  encrypts + inserts into `serverCredentials`.
- The Assistant turn resolves credentials via `DbCredentialResolver`
  (`server-factory.ts:247`), which reads `serverCredentials`. So once the PUT
  completes, `credentialResolver.resolve("anthropic_api_key")` returns the key and
  `resolveAgentModel` does NOT throw `MissingCredentialError` → **no `missing_key`**.
- **Ordering guarantee AV1 keeps:** the key PUT completes *before* the nav that
  auto-opens the overlay. Today the PUT is awaited before `navigate(...)`
  (`SetupFlow.tsx:202-212`), so the key is present when the overlay opens and fires
  the first turn. AV1 keeps this ordering and adds a test that asserts the key write
  precedes the success nav (component test on the submit sequence).

### D3 — What AV1 guarantees vs what remains
AV1 CAN and WILL guarantee, at Assistant open after onboarding:
- **Harness set** — the onboarding assistant stub now carries a real `harnessType`
  (persisted primary or builtin) via consumption path 3. → no `missing_harness`.
- **Key present** — the entered Anthropic key is in `serverCredentials` before the
  overlay opens (D2). → no `missing_key`.
Therefore the auto-opened Assistant renders a ready assistant (welcome message,
composer enabled), not a notice-card burst. `provider_error` (a live upstream 5xx/
timeout) is out of AV1's control — it is a genuine runtime error, not a
misconfiguration, and is correctly surfaced if it happens.

### D4 — Keep the auto-open + its tests
- `SetupFlow.tsx:212` keeps `navigate("/work?onboarding=true")`.
- `AppShell.tsx:282-294` auto-open effect is **kept**.
- **`AE2-onboarding-autoopen.test.tsx` is KEPT in full** (both positives — opens on
  `?onboarding=true`, clears the param — and both negatives). The prior plan's
  deletion of the positives is **reverted**.
- **`AE2-SetupFlow.test.tsx` nav test is KEPT** asserting `/work?onboarding=true`.
  The prior plan's rewrite to expect `/work` (no param) is **reverted**.
- New coverage proves *readiness*, not removal: an integration test that runs the
  onboarding sequence then a first Assistant turn and asserts the turn does NOT
  persist a `missing_key`/`missing_harness` notice (see dod AC4).

## Decision 3 — Folder → filesystem + git detection (UNCHANGED — prior non-reverted fixes kept)

Reuse `createGitRunner`; add the one missing verb; server-side probe route; safe
register sequence. All four prior fixes stand.

### 3.1 — Reuse the existing git runner
`createGitRunner(repoPath)` (`git-export-runner.ts:312`) carries the security-reviewed
git-spawn path (redaction, timeouts, env allowlist) and `revParseIsInsideWorkTree()`.
The only missing primitive is reading the current branch. Add ONE method:
- `currentBranch(): Promise<string | null>` on `interface GitRunner`
  (`git-export-runner.ts:34`), implemented in `createGitRunner` via
  `git rev-parse --abbrev-ref HEAD` on the same `run(...)` helper; returns `null` on
  failure / empty stdout / `"HEAD"` (detached / no-commits). Never throws. Mirror in
  `createFakeGitRunner` (`:570`). No new execFile / redaction path.

> @lore AV1: onboarding branch detection reuses createGitRunner. currentBranch() was
> the one missing verb — added to GitRunner, not a new git-spawn path — to keep the
> single audited git surface (redaction/timeout/env-allowlist).

### 3.2 — Probe helper + route
- `inspectLocalPath(path, deps?): Promise<{ exists; isGitRepo; branch }>` in
  `packages/server/src/services/inspect-local-path.ts` — calls `createGitRunner(path)`
  (injectable via `deps.gitRunnerFactory` for tests): `exists` via `fs.stat`,
  `isGitRepo` via `revParseIsInsideWorkTree()`, `branch` via `currentBranch()` when a
  repo. Never throws — returns `{exists:false,isGitRepo:false,branch:null}` on any
  failure.
- `POST /api/filesystems/inspect-path` in `filesystems.ts` (body `{ path }`, zod +
  body-limit, `requireBoundary({kind:"public-data"})`, read-only). Justified as a
  separate route because `codeRefSchema.branch.min(1)` (`:38-42`) forces the caller to
  know the branch *before* registering a `code` fs; a pre-register probe is genuinely
  needed and folding it into the register route would require loosening that schema.
  Reusable by Settings' future "+ Add filesystem".

### 3.3 — Register submit sequence (best-effort, after team create, never rolls back)
1. If a folder was picked: `POST /api/filesystems/inspect-path {path}`.
2. Resolve `teamId` from the team POST response (`CreateTeamResponse.team.id`).
3. Register honoring `branch.min(1)`:
   - **git repo WITH resolvable branch** → `kind:"code"`,
     `resourceRef:{kind:"code", repo:path, branch}`, `writeback:"none"`,
     `connectionId:null`.
   - **git repo NO resolvable branch** (detached / no commits → `currentBranch()`
     `null`) → `kind:"doc_set"` (a `code` register would 400 on empty branch). Chosen
     over fabricating `branch:"main"`; reversible in Settings.
   - **non-git folder** → `kind:"doc_set"`, `resourceRef:{kind:"doc_set", folder:path}`,
     `writeback:"none"`.
4. `writeback` is the **literal `"none"`** for every onboarding registration
   (`WRITEBACK_MODES[0]` is `"git"` — do not use index-0).
- Graceful degrade: inspect/register failure is swallowed (logged); team creation
  already succeeded; setup still navigates.

## Decision 4 — Greyed (not omitted) non-installed harnesses in the picker (RE-SPEC)

Founder: show claude/codex/opencode even when not on PATH, greyed/disabled with an
install hint; only installed/ready ones choosable.

- `GET /api/harnesses` already returns **all** registered descriptors, including
  non-installed ones with `discovery.state === "missing"`. The picker renders
  **every** descriptor — it does NOT filter.
- **Choosability gate:** a row is selectable when its descriptor is ready to run —
  `descriptor.discovery.state === "ready"` (or `builtin`, always ready). Rows with
  `state === "missing"` (and `unavailable`) render **greyed/disabled** with an
  install-hint affordance derived from `descriptor.authAction`
  (`harness-capability-descriptor.ts:16-24`; e.g. `native_cli_login` → "Install &
  sign in to use"). `unauthenticated`/`installed` render as a distinct
  "installed — needs sign-in" affordance (not choosable-as-primary in AV1; surfaced so
  the user knows it exists).
- `derivePrimaryHarness` is only ever called on a **choosable** descriptor, so the
  greyed rows never produce a `primaryHarness`. On a fresh machine: built-in is the
  default-selected choosable row; claude/codex/opencode show greyed with "install to
  use".
- No change to `derivePrimaryHarness`'s internals (the `.selectable` model filter is
  unchanged); the *picker* gains the greyed rendering + the state-based choosability
  gate. Update the design brief (`design/approved.md`) accordingly.

---

## Split decision: **keep as ONE work package** (re-justified after scope growth)
The founder wants "onboarding configures the machine" as one coherent change. The
scope growth from decision 1 (a migration + a read helper + three consumption edits)
is real but small and cohesive: it is one concept (a persisted team default) touched
in one writer + one resolver + three call sites, all in `teams-routes.ts` /
`scaffold-agents.ts` / `assistant-turn.ts`, plus a 3-column additive migration.
Splitting would strand awkward intermediate states in main (e.g. the column exists but
nothing reads it, or the picker persists a default that add-agent ignores). The
migration is additive-nullable (zero backfill, zero behavior change for existing
teams), so it does not carry the risk that would force a split. **One WP, four task
groups.**

## Ordered tasks
**Group A — persisted team default (schema + write + read + consumption)**
1. Add `defaultHarnessType`/`defaultModelId`/`defaultModelProvider` to `teams`
   (`schema.ts:17`) + `npm run db:generate` → migration `0042_<slug>.sql`
   (3 nullable ADD COLUMN). Test: migration applies clean; `Team` type exposes the
   columns (typecheck) + an integration insert/select round-trips them.
2. `resolveTeamAgentHarness(explicit, team)` in
   `packages/server/src/services/team-default-harness.ts`. Test:
   `team-default-harness.test.ts` (unit — explicit wins; team default used when no
   explicit; `undefined` when both unset so builtin fallback applies).
3. `POST /api/teams` write path: persist the default on team insert when
   `primaryHarness` present (`teams-routes.ts:401-409`). Test: covered by AC2
   integration (team row carries the default).
4. Consume the default at the two remaining paths:
   - add-agent-later (`teams-routes.ts:663`) → pass
     `resolveTeamAgentHarness(undefined, team)`.
   - onboarding assistant stub (`teams-routes.ts:543-550`) → set harness fields from
     `resolveTeamAgentHarness(primaryHarness, team)` (builtin fallback inline).
   Test: AC2 (add-agent inherits) + AC4 (assistant carries harness).

**Group B — harness pick UI (frontend + shared helper)**
5. `derivePrimaryHarness(descriptor)` in `packages/shared/src/harness/` (unchanged
   `.selectable` filter) + export. Test: `derive-primary-harness.test.ts`.
6. SetupFlow harness-picker: fetch `GET /api/harnesses` on mount; render **every**
   descriptor — built-in default-selected + installed choosable rows + **greyed
   non-installed rows with install hint**; choosability gated on `discovery.state`;
   degrade-to-builtin on fetch failure; thread `derivePrimaryHarness(chosen)` (omit
   for builtin) into the `POST /api/teams` body. Test:
   `AV1-SetupFlow.harness.test.tsx` (component — greyed rows render + are not
   selectable; installed rows selectable; builtin default).

**Group C — folder → filesystem + git (reuse GitRunner)**
7. Add `currentBranch()` to `GitRunner` + `createGitRunner` + `createFakeGitRunner`.
   Test: extend git-export-runner coverage (committed repo → branch; no-commit →
   `null`).
8. `inspectLocalPath()` helper. Tests: `inspect-local-path.test.ts` (fake runner) +
   `inspect-local-path.integration.test.ts` (real `git init` + commit; no-commit
   repo → `branch:null`).
9. `POST /api/filesystems/inspect-path` route. Test: filesystems integration.
10. SetupFlow submit: inspect + register (code+branch | doc_set fallback |
    doc_set; `writeback:"none"`), best-effort. Test:
    `AV1-onboarding-filesystem.integration.test.ts`.

**Group D — Assistant ready (keep auto-open)**
11. Assistant-ready: relies on Group A path 3 (stub gets a harness) + the existing
    key-before-nav ordering (D2). KEEP the auto-open and its AE2 tests. New test:
    `AV1-assistant-ready.integration.test.ts` — run onboarding sequence + first
    assistant turn; assert NO `missing_key`/`missing_harness` notice persisted
    (sanity-break: a stub with harness cleared DOES persist `missing_harness`). Plus
    a component assertion that the key PUT precedes the success nav.
12. (Robustness, retained) Guard `maybeNotifyAgentError` on
    `agentSessions.length > 0` (`teams-routes.ts:842`) — never-run ⇒ never degraded,
    with the crashed-session sanity-break. NOT the burst fix (the burst fix is D11 +
    Group A); kept as an explicitness invariant.

## Trade-offs & open questions
- **Migration on `teams`** — additive nullable, zero backfill, existing teams read
  `null` → builtin fallback (no behavior change). This is the cost of the founder's
  "persisted default" shape; justified as the correct home over `serviceConnections`
  (per-user, orthogonal) and over runtime discovery (not persisted).
- **Lazy assistant-create (`assistant-turn.ts:434`) stays builtin** — it has no team
  in scope (userId-only). For onboarding this path is rarely hit because the stub
  (path 3) already created the row with the right harness. Fully team-aware lazy
  creation is AV2's concern.
- **`provider_error` on first turn** is out of AV1 scope — it is a genuine upstream
  failure, not a misconfiguration; AV1 only guarantees key+harness so
  `missing_key`/`missing_harness` cannot fire.
- **Empty-branch git repo → `doc_set`** — deliberate degrade; reversible in Settings.
- **`inspect-path` as a new route** — justified against `branch.min(1)`, not a "pure
  writer" claim.
- **Team-scoped, not global, default** — matches how agents + filesystems are scoped;
  a cross-team/workspace default is explicitly out of scope.
