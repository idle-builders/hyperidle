# AM4 — Harness detection & onboarding — Architecture

Input contracts (fixed, not re-litigated): `plans/AM4/design/approved.md` (Variant C), AM2 capability descriptor (`docs/agent-layer/harness-capability-descriptor.md`), `.pipeline/work-packages/TRACK-AM.md` § AM4.

## Summary

AM4 is a **frontend composition** plus **two backend endpoints** (re-detect + disable). The read path is already shipped by AM2: `GET /api/harnesses` → `HarnessCapabilityDescriptor[]` returns the full list including missing/unauthenticated families, with discovery state, version, auth action, models, and runtime caps. Backend gaps: (1) the "**on demand**" re-detection AC — production discovery runs once at boot and is frozen into the `AdapterPool`; a re-fetch returns the same snapshot, so we add `POST /api/harnesses/redetect` (surfaced as the header **Refresh** affordance); (2) **enable/disable (R1 reversal, founder review + AC2)** — a persisted `harnessDisabled: string[]` key in the existing `server_config` blob, a `discovery.disabled` stamp on descriptors **at the route layer**, an `AdapterPool.select()` gate driven by a `disabledTypes` requirement passed in **by the caller**, and `POST /api/harnesses/:type/disabled` to flip it. See Design-it-twice §B.

**The four wiring seams (the corrected disabled-state story — each addresses a codebase reality the prior draft collided with):**

- **Seam 1 — `select()` wiring (caller passes the set in).** `AdapterPool` is DB-free and `select()` is synchronous; it CANNOT read `readServerConfig(db)` itself. The disabled set is therefore a `SelectRequirements.disabledTypes?: readonly string[]` the caller supplies. The pool stays a pure in-memory registry (preserves the AM2 immutability `@lore`). Sole production caller: `admitSession` (`session-provisioning.ts:333`), which already destructures `db` from `deps` (line 276) and reads `harnessDisabled` via `readServerConfig(db)` before calling `select()`. `select()` has **zero other production callers** — one-site change.
- **Seam 2 — built-in is NOT disableable, enforced in TWO places.** The `select()` disabled-filter HARD-EXEMPTS `type === "builtin"` regardless of the persisted set (back-stop against hand-edited/stale config). `showsToggle(builtin) === false` is the front-door guard. Both, not either/or.
- **Seam 3 — `discovery.disabled` is stamped in the ROUTE handler, not the pool.** `listCapabilityDescriptors()` is sync + DB-free (`adapter-pool.ts:219`) — it cannot read settings. `createHarnessRoutes` gains a `db` param; the GET + redetect handlers `await readServerConfig(db)`, then map `disabled` onto each descriptor by `type` in the handler.
- **Seam 4 — `:type` validation + builtin-reject at the write boundary.** `POST /api/harnesses/:type/disabled` validates `:type` against the descriptor list (400 unknown), rejects `{disabled:true}` for builtin (400/409), and is the API trust boundary independent of the UI hiding the toggle.

Everything else is a new `SettingsHarnesses` web section + `HarnessCard` sub-component composing existing DS primitives, driven entirely by the descriptor through the `harness-presentation` mappers (zero per-backend branching).

## Required reading (engineer reads ONLY these)

- `plans/AM4/design/approved.md` — the visual contract + component mapping (authoritative for UI).
- `docs/agent-layer/harness-capability-descriptor.md` — descriptor fields + readiness states.
- `packages/shared/src/harness/harness-capability-descriptor.ts` — the types to import.
- `packages/server/src/routes/harnesses.ts` — the existing route + its `@lore` (do NOT add an in-route key check). `createHarnessRoutes(pool)` (line 33) currently takes pool only — Seam 3 adds `db`.
- `packages/server/src/harness/adapter-pool.ts` — `listCapabilityDescriptors` (line 219, sync + DB-free), `select()` (line 161, the gate goes next to the `harnessType` filter at line 182-184), `SelectRequirements` (line 58-63, add `disabledTypes`), `discoveries`, `createLocalAdapterPool`.
- `packages/server/src/services/server-config.ts` — `readServerConfig`/`updateServerConfig` + the P3 Zod deep-merge pattern (`ServerConfigSchema` line 81, `applyDefaults` line ~150, `ServerConfigPatch` line ~120). The `harnessDisabled` key is added exactly like `notifications`.
- `packages/server/src/services/session-provisioning.ts` — `admitSession` (line ~265); `db` already in `deps` (line 276); `select(selectRequirements)` call site (line 333) — the sole production caller that reads `harnessDisabled` and passes `disabledTypes`.
- `packages/server/src/app.ts` — harness mount (line 451, `createHarnessRoutes(options.adapterPool)`); Seam 3 threads `options.db`.
- `packages/server/src/harness/harness-discovery.ts` — `discoverLocalHarnesses()` (the probe the redetect endpoint re-runs).
- `packages/web/src/settings/SettingsModels.tsx` + `SettingsAgents.tsx` — sibling fetch/loading/error/section patterns to mirror.
- `packages/web/src/pages/SettingsPage.tsx` — where the section registers.

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| Render from `GET /api/harnesses` descriptors | EXISTS (`routes/harnesses.ts`, mounted app.ts:451), returns full `HarnessCapabilityDescriptor[]` incl. discovery/auth/version/models/runtime | Frontend consumes as-is. No route change for the read. |
| Descriptor carries status/version/auth/capabilities | EXISTS — `discovery{state,version,reason}`, `authAction{kind,label,command,credentialNames,description}`, `models`, `runtime` | Map via new `harness-presentation.ts`. |
| Detection runs "on setup AND on demand" | Discovery runs ONCE at boot, frozen in pool. Re-fetch = stale snapshot | **NEW** `POST /api/harnesses/redetect` re-runs `discoverLocalHarnesses()` + refreshes pool snapshot. (Design-it-twice §A.) |
| Re-detect refreshes runtime capabilities | **NO.** `discoverLocalHarnesses()` deliberately does NOT run the session probe (adapter-pool.ts:349-354 `@lore` AM2). Re-detect re-runs the same probe → `fileEditing`/`toolUse`/`mcpSupport`/`subAgents` stay `false` for every backend until AM3 / first real run. Re-detect refreshes **readiness/version/auth only**, not runtime caps. | UI must read correctly under all-`false` caps: the fold shows declared models + "confirmed after first run" (R2), never a wall of "No". Fixtures + story render this production shape. See AC2 verification + States. |
| `missing`/`unauthenticated`/`unavailable` families surface | EXISTS — `missingKnownHarnessDescriptors` appends them with discovery state | No work; the UI renders all states. |
| `cursor-agent` → `unavailable`, no install CTA | EXISTS — descriptor emits `unavailable` + reason | `hasActionableNextStep` returns false for it (authAction.kind="none" / state unavailable). |
| Enable/disable a backend | No `disabled` field on descriptor or schema; agents carry `harnessType` (`db/schema.ts:71`); `AdapterPool.select()` gates on capacity/modelProviders/harnessType only (verified adapter-pool.ts:161-196); pool is DB-free, `select()` is sync, `listCapabilityDescriptors()` is sync + DB-free; `createHarnessRoutes(pool)` mounted with NO db (app.ts:451) | **REVERSED §B (founder review + AC2)** — restore a REAL toggle via the four seams: (1) persist `harnessDisabled: string[]` as a new optional key in the existing `server_config` blob (NOT a new table, NOT `factorySettings`); (2) `select()` gains a `disabledTypes` requirement the **caller** passes (the pool can't read the DB) with a hard builtin exemption; (3) the **route handler** (not the pool) stamps `discovery.disabled` after `readServerConfig(db)`; (4) `POST /api/harnesses/:type/disabled` writes the key with `:type`-validation + builtin-reject. Scope addition, flagged below. |
| `enter_api_key` action target | builtin credential lives via gateway/`safeStorage`; `SettingsModels` shows `hasApiKey` | Auth CTA for `enter_api_key` routes to the existing credential surface; AM4 builds NO new storage. |
| StatusChip supports needed statuses | EXISTS — `healthy|behind|paused|blocked|done|error` + `"unknown"` sentinel | `readinessToStatus` maps to `healthy/behind/paused/unknown`. |

No spec/doc contradiction requiring a `/concept` reopen.

## Design-it-twice

### A. "On demand" re-detection — endpoint vs client-only

- **Option A1 — `POST /api/harnesses/redetect`** re-runs `discoverLocalHarnesses()` server-side and replaces the pool's discovery snapshot, returns the fresh `HarnessCapabilityDescriptor[]`. Trade-off: needs the pool to expose a `refreshDiscoveries()` mutator (the field is currently `private readonly` + frozen). Reject reason: adds a mutable path to a deliberately-immutable structure — must be done carefully.
- **Option A2 — client just re-GETs `/api/harnesses`.** Trade-off: zero backend work. Reject reason: returns the **same boot-time snapshot** — a user who runs `codex login` then clicks "Re-detect" still sees `unauthenticated`. Fails the AC's spirit ("on demand" detection) and the "actionable next step" loop (the user can't verify their action worked).

**Synthesis → A1.** Add `AdapterPool.refreshDiscoveries(): Promise<void>` that calls `discoverLocalHarnesses()` and reassigns the snapshot (drop `readonly`; keep the freeze on each reassignment). `POST /api/harnesses/redetect` calls it then returns `listCapabilityDescriptors()`. This makes the detection loop honest: act → re-detect → state changes. The GET stays the cheap boot-snapshot read for first paint.

### B. Enable/disable persistence — REVERSED to B1 (founder review + AC2)

**SCOPE ADDITION THIS ROUND — flagged for architecture-critique re-check.** The prior round ruled B2 (no persisted state, non-interactive label). The founder, reviewing the real t3code Providers reference (where a real enable/disable switch is the headline affordance and disabling actually disables the provider), directed restoring a real toggle. **AC2 explicitly requires "enable, disable, and configure."** This reverses the prior ruling.

- **Option B1 (CHOSEN) — persisted per-harness disabled set + a runtime consumer.** `harnessDisabled: string[]` (list of `harnessType`s the user turned off) persisted as a new optional key in the existing `server_config` blob, written/read via `updateServerConfig`/`readServerConfig` (same Zod-validated deep-merge store P3 used for notification prefs). `AdapterPool.select()` gains one gate driven by a `disabledTypes` requirement; the **caller** (`admitSession`) supplies it after reading the config. The descriptor read path surfaces `discovery.disabled: boolean`, stamped **in the route handler** from `readServerConfig(db)` (the pool is DB-free), so the UI renders the toggle state + "Disabled — …" line without a second fetch. `POST /api/harnesses/:type/disabled { disabled: boolean }` writes the key. Trade-off: adds one persisted config key + a `select()` gate + a write endpoint — real scope. **Why it's justified now:** the toggle is no longer dead state — it changes selection behavior (the exact objection the prior round raised is *resolved by adding the consumer*), and AC2 + founder review demand it.
- **Option B2 (prior, now rejected) — derived, no persisted state, non-interactive "Enabled" label.** Rejected: does not satisfy AC2's "disable" verb, and does not match the founder's referenced affordance.

**Synthesis → B1, wired via the four seams (re-critique NEEDS-CHANGE corrections folded in):**

1. **Persistence — `server_config` blob, not a new table/`factorySettings`.** Add `harnessDisabled: z.array(z.string()).default([])` as a new optional key to `ServerConfigSchema` (server-config.ts:81), mirror it in `applyDefaults` (parse `raw.harnessDisabled ?? []`), `DEFAULTS` (`harnessDisabled: []`), `ServerConfig` type, and `ServerConfigPatch` (`harnessDisabled?: string[]`). Exactly the notification-prefs pattern — Zod-validated deep-merge.

2. **`select()` gate — caller passes `disabledTypes` in (CHANGE 1).** `AdapterPool` is DB-free and `select()` is synchronous; it cannot call `readServerConfig`. So: add `readonly disabledTypes?: readonly string[]` to `SelectRequirements` (adapter-pool.ts:58-63). Filter in the existing `select()` loop next to the `harnessType` gate (line 182-184): `if (requirements?.disabledTypes && entry.meta.type && entry.meta.type !== "builtin" && requirements.disabledTypes.includes(entry.meta.type)) continue;`. The sole production caller, `admitSession` (session-provisioning.ts:333), already has `db` (line 276) — it reads `harnessDisabled` via `readServerConfig(db)` and spreads `disabledTypes` into `selectRequirements`. Keeps the pool a pure in-memory registry (preserves the AM2 immutability `@lore`). `select()` has zero other production callers — one-site change.

3. **Builtin hard-exempt in `select()` (CHANGE 2 — MANDATORY back-stop).** The `select()` disabled-filter HARD-EXEMPTS `type === "builtin"` regardless of what the persisted set contains (back-stop against hand-edited / stale config — see the `&& entry.meta.type !== "builtin"` clause above). `showsToggle(builtin) === false` is the front-door guard; the `select()` exemption is the back-stop. Spec **both**, not either/or. This is not optional risk-mitigation — a fully-disabled fleet must never strand the builtin, which is the always-present fallback.

4. **`discovery.disabled` stamped in the route handler (CHANGE 3).** `pool.listCapabilityDescriptors()` is sync + DB-free (adapter-pool.ts:219) — it CANNOT stamp. `createHarnessRoutes(pool, db)` (Seam 3); the GET + redetect handlers `await readServerConfig(db)`, read `harnessDisabled`, then map `{ ...d, discovery: { ...d.discovery, disabled: harnessDisabled.includes(d.type) } }` over the descriptor list in the handler before responding.

5. **Write endpoint with validation + builtin-reject (CHANGE 4).** `POST /api/harnesses/:type/disabled` — see Route checklist.

The mapper reads `discovery.disabled` (`discovery.disabled?: boolean`, additive field on `HarnessDiscoveryStatus`, harness-capability-descriptor.ts:70 — breaks no AH2/AM2 contract test). Disabled = config, not credential — does not touch the "credential storage out of scope" line.

## Types & contracts

### Shared (already exist — import, do not redefine)
`HarnessCapabilityDescriptor`, `HarnessReadinessState`, `HarnessAuthActionDescriptor`, `HarnessModelDescriptor`, `HarnessRuntimeCapabilities` from `@hyperidle/shared`.

### New web presentation module (lifted from the design story)
`packages/web/src/settings/harness-presentation.ts` — pure, descriptor-only mappers (the single interpretation point; reviewer greps here to confirm no `type ===` branch):

```ts
export function statusLine(d: HarnessCapabilityDescriptor): { tone: Status | "unknown"; text: string }; // dot tone + calm muted line (replaces the StatusChip pill)
export function accessModeLabel(mode: HarnessAccessMode): string;
export function hasActionableNextStep(d: HarnessCapabilityDescriptor): boolean;
export function showsToggle(d: HarnessCapabilityDescriptor): boolean;   // ready|installed|unauthenticated → real enable/disable Toggle visible
export function isEnabled(d: HarnessCapabilityDescriptor): boolean;     // !discovery.disabled
export function hasCaps(d: HarnessCapabilityDescriptor): boolean;       // models OR any proven cap (and not disabled) → fold visible
export function provenCapabilities(d: HarnessCapabilityDescriptor): readonly string[]; // only true runtime caps
export function commandText(d: HarnessCapabilityDescriptor): string | null;
export function capabilitySummary(d: HarnessCapabilityDescriptor): string;      // proven caps, else "confirmed after first run"
// retained for legacy variant A only, delete with A/B (task 8):
export function readinessToStatus(state: HarnessReadinessState): { status: Status | "unknown"; label: string };
export function showsEnabledIndication(d: HarnessCapabilityDescriptor): boolean;
```

**Toggle mapper resolution (design-it-twice §B — REVERSED to B1).** There IS a real interactive `Toggle`. `showsToggle(d)` returns `true` for `ready|installed|unauthenticated` **EXCEPT** `type === "builtin"`, which returns `false` (founder decision: built-in is NOT disableable — front-door guard, paired with the `select()` hard-exemption back-stop, Seam 2/CHANGE 2); `isEnabled(d)` = `!discovery.disabled`. Flipping the toggle calls `POST /api/harnesses/:type/disabled` and re-renders. Rationale (changed from prior): `AdapterPool.select()` now gains a caller-driven `disabledTypes` gate (the consumer), so the flag is live, not dead state. Add a `@lore` at `showsToggle`/`isEnabled` recording "real persisted control backed by `server_config.harnessDisabled` + the caller-supplied `select()` `disabledTypes` gate (AM4 R1 reversal, founder review + AC2); `showsToggle` is computed from `discovery.state`, never a family switch — the sole `type` check is the `builtin` exemption, which is intentional, not per-family branching." The `missing`/`unavailable` states return `false` (nothing to disable). The builder lifts this exact shape from `AM4HarnessVariantC.stories.tsx` (`AM4HarnessPresentation.ts`).

**Component-budget — label-less `Toggle` (one DS enhancement, not a new component).** DS `Toggle` always renders a visible text label; the reference switch is bare. The design story renders a switch with `Toggle`'s exact visual + a11y contract inline with an sr-only `aria-label`. **Founder decision (minor):** the label-less switch is folded into the DS `Toggle` as a **reusable variant** — the builder lifts it there (a label-less / sr-only-label affordance reused by every settings row toggling without adjacent text — clears the 2+-context bar), re-blesses the `Toggle` snapshot, and does NOT ship the inline story copy or hand-roll a second switch.

**Founder decision (minor) — fold label stays "Models."** The capabilities `Fold` keeps the "Models" / "Hide" cta label (confirmed — no change). The fold renders declared model rows + the proven-caps line (R2).

(The `readinessToStatus` mapping is a candidate to live with the design-system `status-mapping` family alongside `betStatusToStatus` etc.; the builder may place it there and re-export — it is a reusable status mapping, not AM4-only. Decide in review; functionally identical either way.)

### New backend endpoint
```
POST /api/harnesses/redetect
  auth: requireBoundary({ kind: "public-data" })   // same as GET — matches the @lore boundary
  rate-limit: createRateLimiter({ limit: 1, windowMs: 5000 })   // dedicated, route-scoped — see Security (WARNING 3)
  body: none
  200 → HarnessCapabilityDescriptor[]   // fresh snapshot, identical shape to GET
  429 → ApiErrorResponse   // when called again within the 5s window
```
Mount the dedicated limiter ONLY on this route (`harnessRoutes.use("/redetect", createRateLimiter({ limit: 1, windowMs: 5000 }))` or inline before the handler), NOT globally — the global 300/min limiter (app.ts:262) stays for the rest. This is a concrete plan item, not "builder confirms".
```
POST /api/harnesses/:type/disabled            // R1 reversal — write the persisted disable set (CHANGE 4)
  auth: requireBoundary({ kind: "public-data" })   // same boundary as GET/redetect — consistent (confirmed)
  rate-limit: global 300/min (app.ts:262) — acceptable, state explicitly (no fork-bomb amplification: one DB write, no CLI spawns). NOT the dedicated 5s limiter (that's redetect-only, which spawns ~10 CLI probes).
  body: { disabled: boolean }
  validation: :type MUST satisfy pool.listCapabilityDescriptors().some(d => d.type === :type) → 400 on unknown :type
  builtin-reject: { disabled: true } when :type === "builtin" → 400/409 (API is a trust boundary independent of the UI hiding the toggle — belt-and-suspenders with the select() exemption, Seam 2/CHANGE 2)
  effect: updateServerConfig(db, { harnessDisabled: <add/remove :type> })   // additive write to the server_config blob
  200 → HarnessCapabilityDescriptor[]   // fresh list with discovery.disabled re-stamped in the handler (Seam 3)
  secret-leak: extend the AH2/AM2 apiKey|baseUrl|sk-|subscriptionToken assertion to THIS response too
```

```ts
// SelectRequirements (adapter-pool.ts:58-63) — EDIT: add one optional field
export interface SelectRequirements {
  readonly modelProviders?: readonly string[];
  readonly harnessType?: string;
  readonly disabledTypes?: readonly string[];   // CHANGE 1 — caller-supplied; pool is DB-free
}

// AdapterPool
async refreshDiscoveries(): Promise<void>;   // re-runs discoverLocalHarnesses(), reassigns this.discoveries
select(requirements?: SelectRequirements): SelectedEntry | null;
  // EDIT: in the existing loop, next to the harnessType gate (line 182-184), add:
  //   if (requirements?.disabledTypes && entry.meta.type
  //       && entry.meta.type !== "builtin"            // CHANGE 2 — hard builtin back-stop
  //       && requirements.disabledTypes.includes(entry.meta.type)) continue;

// createHarnessRoutes (harnesses.ts:33) — EDIT signature: + db (CHANGE 3 / Seam 3)
export function createHarnessRoutes(pool: AdapterPool, db: HyperIdleDb): Hono;
//   GET / and POST /redetect handlers: const { harnessDisabled } = await readServerConfig(db);
//   then stamp discovery.disabled per descriptor by type IN THE HANDLER (the pool can't).
// app.ts:451 mount — EDIT: createHarnessRoutes(options.adapterPool, options.db)

// admitSession (session-provisioning.ts:333) — EDIT: read config, pass disabledTypes
//   const { harnessDisabled } = await readServerConfig(db);   // db already in deps (line 276)
//   const selectRequirements = { ...existing, disabledTypes: harnessDisabled };
```

## Component breakdown

| File | Role |
|---|---|
| `packages/web/src/settings/harness-presentation.ts` | descriptor→presentation mappers (NEW; lifted from design `AM4HarnessPresentation.ts`) |
| `packages/web/src/settings/HarnessCard.tsx` | one backend card: header + auth zone + unavailable zone + capabilities `Fold` (NEW). Pure presentational — props = `{ descriptor, onAuthAction, onRedetectHint? }`, callbacks injected |
| `packages/web/src/settings/SettingsHarnesses.tsx` | section container: fetch `GET /api/harnesses`, loading/error/empty/populated, header counts, actionable-first sort, "Re-detect" button → `POST /api/harnesses/redetect` (NEW) |
| `packages/web/src/settings/SettingsHarnesses.stories.tsx` | stories: populated (real states), loading, error, empty, all-ready (NEW; supersedes the 3 design `AM4HarnessVariant*` stories — delete those + fixtures + presentation dupe) |
| `packages/web/src/settings/HarnessCard.stories.tsx` | per-card states: ready, unauthenticated, installed, unavailable (NEW) |
| `packages/web/src/pages/SettingsPage.tsx` | register `<SettingsHarnesses/>` as a stacked "Agent backends" section near Models/Agents (EDIT) |
| `packages/server/src/harness/adapter-pool.ts` | add `refreshDiscoveries()`; add `disabledTypes?` to `SelectRequirements`; add the caller-driven `disabledTypes` gate with builtin hard-exemption to `select()`. **Does NOT stamp `discovery.disabled` — the pool is DB-free; stamping moves to the route (CHANGE 3)** (EDIT) |
| `packages/server/src/routes/harnesses.ts` | `createHarnessRoutes(pool, db)` (signature change); add `POST /redetect` + `POST /:type/disabled`; GET + redetect handlers `readServerConfig(db)` and stamp `discovery.disabled` per descriptor (EDIT) |
| `packages/server/src/app.ts` | thread `options.db` into the harness mount: `createHarnessRoutes(options.adapterPool, options.db)` (line 451) (EDIT) |
| `packages/server/src/services/server-config.ts` | add `harnessDisabled: z.array(z.string()).default([])` to `ServerConfigSchema` + `applyDefaults` + `DEFAULTS` + `ServerConfig` type + `ServerConfigPatch` (EDIT) |
| `packages/server/src/services/session-provisioning.ts` | `admitSession`: `readServerConfig(db)` (db already in deps) → spread `disabledTypes: harnessDisabled` into `selectRequirements` at line 333 (EDIT) |

DS primitives reused: `StatusChip`, `Toggle`, `Button`, `Fold`, `KeyValue`, `EmptyState`, `ErrorState`, `SkeletonList`. **No new design-system component.**

## Acceptance criteria → verification

| # | AC (from TRACK-AM § AM4) | Verification |
|---|---|---|
| AC1 | On setup + on demand, reports in-scope backends' presence + auth, with status/version/auth shown | Component test (`SettingsHarnesses.test.tsx`): render with fixture descriptors (builtin ready, codex unauth, claude ready v2.1.170, opencode installed, cursor unavailable); assert each name + its `StatusChip` label + version text present. Redetect: integration test `POST /api/harnesses/redetect` returns 200 + array; a back-to-back second call returns 429 (dedicated limiter); unit test on `refreshDiscoveries` asserts the snapshot is replaced (mock `discoverLocalHarnesses`) AND that runtime caps remain all-`false` afterward (re-detect does not run the session probe — WARNING 4). |
| AC2 | User can enable/disable/configure; declared capabilities (models/options) visible | **STALE OLD-R1 ASSERTION REMOVED — the prior "no toggle / `queryByRole('switch')` is null" is wrong post-reversal.** Two red-phase tests prove "disable": **(1) Behavioral proof (the disable verb's only real proof — `adapter-pool`/selection unit test):** register a builtin adapter + a `claude-code` adapter; call the selection path with `disabledTypes = ["claude-code"]` and assert `claude-code` is **never returned** by `select()`; then call with `disabledTypes = ["builtin"]` (wrongly disabled) and assert the builtin **still selects** (hard-exemption back-stop, CHANGE 2). **(2) Component test:** the enable/disable `Toggle` IS present — `getByRole("switch")` resolves — for `ready`/`installed`/`unauthenticated`; ABSENT (`queryByRole("switch")` null) for `builtin`/`missing`/`unavailable`; flipping it fires `POST /api/harnesses/:type/disabled`. **AC2-production-shape (WARNING 4):** render a `ready` descriptor with runtime caps ALL `false` (the realistic production shape, since discovery does not run the session probe); assert the expanded fold shows declared model rows AND the "Capabilities confirmed after first run" line, and assert NO "File editing: No"/"MCP: No"/"Sub-agents: No" text appears. (Configure for builtin = link/CTA to existing credential surface — assert the CTA renders.) Do NOT only test the masked all-`true` fixture shape. |
| AC3 | Present-but-unauthenticated shows actionable next step, not silent failure | Component test: codex (unauthenticated) card renders the auth zone with primary `Button` text === `authAction.label` ("Log in to Codex") AND the mono command `codex login`. Assert both present. cursor (unavailable) renders reason + NO action button (assert button absent). |
| AC4 | Respects AM2 scope — external backends appear iff in scope | Already locked: AM2 scope = native + external BYO; in-scope kinds surface via the descriptor list. Test: assert the four families + cursor render from the fixture; no out-of-scope kind is fabricated by the UI (UI renders exactly what the descriptor list contains — assert `screen` shows only descriptor-provided names). |
| Contract | Descriptor-driven, zero per-backend branching | **ESLint rule (required, not grep) + structural test.** Per CLAUDE.md "First Principle", a static codebase property is enforced by lint, not a drift-prone manual grep. (1) Add an ESLint `no-restricted-syntax` rule scoped to `harness-presentation.ts` + `HarnessCard.tsx` + `SettingsHarnesses.tsx` that bans `BinaryExpression` comparisons (`===`/`!==`) where one side is a string literal equal to a known harness type (`"codex"`, `"claude-code"`, `"opencode"`, `"builtin"`, `"cursor-agent"`). (2) Add a `harness-presentation.test.ts` **two-descriptor structural-equality test**: render `HarnessCard` for two structurally-different `ready` descriptors (e.g. builtin api-gateway vs claude-code CLI), serialize both DOM trees with the descriptor-specific text normalized out, and assert the element/class structure is identical — proving one code path, not a per-family branch. Both are the headline-contract gate; review is secondary. |
| Contract | No color/token changes | `npm run lint` (`design/*` rules) + `token-guard:check` pass; no new token in `tokens.css`. |

## Validation scenarios (map to stories/tests)

- Authenticated backend → shows available + status/version/capabilities: `SettingsHarnesses.stories.tsx` populated + the AC1/AC2 component tests.
- Present-but-unauthenticated → actionable next step: AC3 test (codex card).
- Locked AM2 scope → only in-scope kinds surfaced: AC4 test.

## States (build — design rendered populated only)

- Loading: `SkeletonList rows={3}` (mirror SettingsAgents).
- Error: `ErrorState compact title="Couldn't detect backends" onRetry={refetch}`.
- Empty: `EmptyState` "No agent backends detected" (builtin is always emitted, so true-empty is effectively unreachable; render defensively per frontend rules).
- All-ready: header "{n} ready · 0 need sign-in"; no auth zones (conditional handles it).
- **Ready with unknown runtime caps (the production shape — WARNING 4):** runtime caps are all-`false` because discovery never runs the session probe and re-detect doesn't either. The fold renders declared model rows + "Capabilities confirmed after first run"; the row shows the real enable/disable `Toggle` (on). This is the default real `ready` card — the fixtures (`AM4HarnessVariants.fixtures.ts`) and `SettingsHarnesses.stories.tsx`/`HarnessCard.stories.tsx` MUST render it (not a masked all-`true` shape), and the AC2-production-shape test asserts it.
- **Disabled `ready` (toggle off):** `discovery.disabled === true` → dimmed row, "Disabled — …" status line, fold hidden, toggle off. Rendered in the story + asserted in the component test.
- **Builtin `ready`:** NO toggle (`showsToggle(builtin) === false`); configure CTA routes to the existing credential surface. Asserted in the AC2 component test.

## Ordered build tasks

1. **Backend: `server_config.harnessDisabled` key (Seam 1 / persistence)** — add `harnessDisabled: z.array(z.string()).default([])` to `ServerConfigSchema` + `applyDefaults` (`raw.harnessDisabled ?? []`) + `DEFAULTS` (`harnessDisabled: []`) + `ServerConfig` type + `ServerConfigPatch` (`harnessDisabled?: string[]`), in `server-config.ts`. Test: `server-config` unit test asserts a write of `{ harnessDisabled: ["claude-code"] }` round-trips and `safeParse({})` defaults to `[]` (mirror notifications P3 test). (no dep)
2. **Backend: `AdapterPool.refreshDiscoveries()`** — drop `readonly` on `discoveries`, add async method re-running `discoverLocalHarnesses()` + reassigning the frozen map. Test: `adapter-pool` unit test mocks discovery, asserts snapshot replaced. (no UI dep)
3. **Backend: `select()` `disabledTypes` gate + builtin hard-exemption (Seam 2 / CHANGE 1+2)** — add `disabledTypes?: readonly string[]` to `SelectRequirements`; add the filter next to the `harnessType` gate (line 182-184) skipping any non-`builtin` adapter whose type ∈ `disabledTypes`. Test (AC2 behavioral proof): register builtin + `claude-code`; `select({ disabledTypes: ["claude-code"] })` never returns `claude-code`; `select({ disabledTypes: ["builtin"] })` STILL returns builtin (hard-exemption). (no dep)
4. **Backend: wire `disabledTypes` at the caller (Seam 1 caller side)** — `admitSession` (session-provisioning.ts:333): `const { harnessDisabled } = await readServerConfig(db);` (db already in deps line 276) → spread `disabledTypes: harnessDisabled` into `selectRequirements`. Test: integration — disable `claude-code` via the config, provision an agent whose `harnessType` is `claude-code`, assert `NoEligibleHarnessError` (or the capacity error) rather than a `claude-code` selection. Depends on 1, 3.
5. **Backend: `createHarnessRoutes(pool, db)` + stamp `discovery.disabled` in handler (Seam 3 / CHANGE 3)** — change the signature; thread `options.db` at app.ts:451; GET + redetect handlers `await readServerConfig(db)` then map `discovery.disabled` per descriptor by `type` in the handler. Add `POST /redetect` (same boundary as GET; dedicated `createRateLimiter({ limit: 1, windowMs: 5000 })`; calls `refreshDiscoveries()` then stamps + returns descriptors). Test: integration asserts redetect 200 + array + stamped `discovery.disabled` for a config-disabled type + 429 on back-to-back + no-secret leak (mirror AH2). Depends on 1, 2.
6. **Backend: `POST /api/harnesses/:type/disabled` (Seam 4 / CHANGE 4)** — write `harnessDisabled` via `updateServerConfig` (add/remove `:type`); validate `:type` against `listCapabilityDescriptors()` → 400 unknown; reject `{disabled:true}` for `builtin` → 400/409; same boundary; global 300/min limit (state acceptable). Returns fresh list with `discovery.disabled` re-stamped. Test: integration asserts toggle round-trip reflected in the next GET's `discovery.disabled`, 400 on unknown `:type`, 400/409 on builtin-disable, no-secret leak. Depends on 1, 5.
7. **Web: `harness-presentation.ts`** — lift from design `AM4HarnessPresentation.ts` (REVERSED-to-B1 shape: `statusLine`/`showsToggle`/`isEnabled`/`hasCaps`/`provenCapabilities`/`commandText`/`capabilitySummary`; `showsEnabledIndication` kept only as a legacy alias until task 11 deletes variant A). Add the `@lore` at `showsToggle`/`isEnabled` (real persisted control backed by `server_config.harnessDisabled` + caller-supplied `select()` `disabledTypes` gate; builtin exemption is intentional, not per-family branching). Unit test `harness-presentation.test.ts` per mapper (readiness→status table, `hasActionableNextStep` per state, `showsToggle` true for ready/installed/unauthenticated EXCEPT builtin, `isEnabled` = `!discovery.disabled`, `provenCapabilities` empty when caps all-false → `capabilitySummary` returns "confirmed after first run", `hasCaps`, `commandText`, sort). Plus the **two-descriptor structural-equality test** (Contract row). (no dep)
8. **Web: `HarnessCard.tsx` + stories** — presentational card from approved design (real enable/disable `Toggle` via the DS label-less variant, R2 proven-caps fold). Story states ready/unauth/installed/unavailable/disabled/builtin, **with runtime caps all-`false` (production shape)** — do not hardcode caps `true`. Add a `missing` story so the install-hint path is rendered+snapshotted (design-critique SUGGESTION). Component test asserts AC2 (`getByRole("switch")` present for ready/installed/unauth; null for builtin/missing/unavailable; flip fires `POST /:type/disabled`) / AC2-production-shape / AC3 per card. Depends on 7.
9. **Web: `SettingsHarnesses.tsx` + stories** — fetch + states + counts + sort + Re-detect button (in-flight disabled state) + toggle handler calling `POST /:type/disabled`. Component test asserts AC1/AC4 + loading/error/empty/all-ready/ready-with-unknown-caps/disabled-row. Depends on 5, 6, 7, 8.
10. **Web: register in `SettingsPage.tsx`** — add the "Agent backends" stacked section. Update `W3-settings.test.tsx` if it asserts the section set. Depends on 9.
11. **DS: label-less `Toggle` variant** — fold the bare/sr-only-label switch into DS `Toggle` (founder minor decision: reusable variant, not hand-rolled); re-bless the `Toggle` snapshot. Depends on the story shape from 8 (the variant the card consumes).
12. **Lint: descriptor-driven ESLint rule** — add the `no-restricted-syntax` rule (Contract row) banning string-literal comparisons against known harness types within `harness-presentation.ts`/`HarnessCard.tsx`/`SettingsHarnesses.tsx` (the `showsToggle` builtin exemption lives in the mapper and is the one allowed `type` check — scope the rule so it still flags genuine per-family branches; if needed, allow the single `=== "builtin"` literal and ban the rest). Confirm `npm run lint` flags a planted violation then passes clean. (depends on 7,8,9 existing)
13. **Cleanup:** delete the three `AM4HarnessVariant*.stories.tsx`, `AM4HarnessVariants.fixtures.ts`, and `AM4HarnessPresentation.ts` design scaffolds (their essence moved into 7/8/9). Re-bless the DOM-snapshot net for the new + removed stories. **Enumeration-guard note:** deleting 3 variant stories and adding `SettingsHarnesses.stories.tsx` + `HarnessCard.stories.tsx` is a net −1 web settings story. The snapshot-net enumeration guard (`expect(modules.length).toBeGreaterThanOrEqual(56)`, visual-regression.md) counts **design-system** stories (`src/*.stories.tsx` + `src/kinds/*.stories.tsx`), which these web-package files do NOT touch — so the guard is unaffected. Confirm the count still passes after the swap before re-blessing; do NOT lower the threshold (MEMORY: never skip the enumeration guard).

## Route checklist

- `GET /api/harnesses` (exists — read path; now takes `db` and stamps `discovery.disabled` in the HANDLER from `readServerConfig(db).harnessDisabled` (CHANGE 3 — the pool can't, it's DB-free); no contract break — `discovery.disabled?: boolean` is additive on `HarnessDiscoveryStatus`).
- `POST /api/harnesses/redetect` (NEW — `routes/harnesses.ts`, `requireBoundary({ kind: "public-data" })` + dedicated `createRateLimiter({ limit: 1, windowMs: 5000 })` mounted on this route only, re-stamps `discovery.disabled` in the handler too, returns fresh descriptors, asserts no secret leak, asserts 429 on a back-to-back second call). Surfaced in the UI as the header **Refresh** affordance next to "Checked just now".
- `POST /api/harnesses/:type/disabled` (NEW — R1 reversal — writes `server_config.harnessDisabled`, returns fresh list with `discovery.disabled` re-stamped in the handler, same boundary; **400 on unknown `:type`** validated against `listCapabilityDescriptors()`; **400/409 on `{disabled:true}` for `builtin`** (write-boundary builtin-reject, CHANGE 4); global 300/min rate-limit (explicitly acceptable — single DB write, no CLI spawns); secret-leak assertion extended to this response).

## Security & abuse cases

- **Rate-limit on POST /redetect (WARNING 3 — bound, not deferred):** `discoverLocalHarnesses()` spawns ~10 `execFile` probes (5 families × version+auth), each with a **15 000ms** timeout (harness-discovery.ts:86). The generic 300/min global limiter (app.ts:262) does NOT protect this — 300 calls/min = up to ~3000 concurrent CLI spawns, a local fork-bomb / DoS vector. **Decision (concrete):** mount a dedicated route-scoped `createRateLimiter({ limit: 1, windowMs: 5000 })` on `POST /api/harnesses/redetect` only. One re-detect per 5s per identity; excess returns 429. Verification: integration test fires two redetects back-to-back, asserts the second is 429. The `{ limit, windowMs }` shape matches `RateLimiterOptions` (rate-limit.ts:37-46); the limiter is per-identity (IP/X-API-Key). This is the bound mechanism — do not relax to the global limiter.
- **Secret-handling:** the redetect response is the same descriptor shape that AH2/AM2 already assert never contains `apiKey|baseUrl|sk-|subscriptionToken`. Add the same assertion to the redetect integration test. The auth-action `command` (e.g. `codex login`) is a public CLI command, not a secret — surfacing it is safe.
- **Disable-write boundary (CHANGE 4):** `POST /:type/disabled` is a trust boundary independent of the UI. `:type` is validated against `listCapabilityDescriptors()` (400 unknown — no arbitrary key injection into `harnessDisabled`); `{disabled:true}` for `builtin` is rejected (400/409) so a hand-crafted request can never disable the always-present fallback (belt-and-suspenders with the `select()` exemption). Body is `{ disabled: boolean }` — single boolean, no path/URL. Rate-limit: global 300/min is acceptable (single DB write, no CLI spawns, no amplification) — stated explicitly, not silent. Secret-leak assertion extended to this response.
- **Input-trust:** redetect takes no body; `/:type/disabled` body is one boolean; no agent-authored free-text field. N/A beyond the `:type` validation above.
- **Path-traversal / SSRF:** no path or URL input. N/A.
- **CLI-token harvesting:** AM4 never reads provider credential files; `enter_api_key` routes to the existing credential surface, `native_cli_login` only displays the command. Confirmed by design contract.

## protectedTests
- `packages/server/src/routes/__tests__/AH2-harnesses.integration.test.ts` — the existing GET contract + secret-leak assertions must not change.
- `packages/server/src/harness/__tests__/AM2-harness-capability-descriptors.test.ts` — descriptor shape stays fixed.

## sharedFiles
- `packages/web/src/pages/SettingsPage.tsx` (section registry — other settings WPs touch it).
- `packages/server/src/routes/harnesses.ts` (route file — AM3 dial-in may also extend; signature now `createHarnessRoutes(pool, db)`).
- `packages/server/src/harness/adapter-pool.ts` (AM3 will wire the session probe here — coordinate the `refreshDiscoveries` + `select()` `disabledTypes` edits).
- `packages/server/src/services/server-config.ts` (shared config blob — notifications/modelGateway WPs touch it; `harnessDisabled` is additive).
- `packages/server/src/services/session-provisioning.ts` (`admitSession` — AH2/AM2/AM3 selection logic; the `disabledTypes` read is additive at line 333).
- `packages/server/src/app.ts` (harness mount line 451 signature change).

## Risks / ambiguities

1. **`refreshDiscoveries` mutability** — the pool was deliberately immutable (AM2 `@lore`). Reassigning a frozen field is safe (freeze is per-object, reassignment replaces the reference) but the builder must keep each new snapshot frozen and ensure no concurrent read sees a half-built map (the reassign is atomic in JS single-thread; the await completes before reassign). Low risk, called out.
2. **Enable/disable semantics (Design-it-twice §B) — REVERSED to B1, wiring RESOLVED via the four seams (re-critique NEEDS-CHANGE corrections folded in).** AM4 ships a REAL toggle: persisted `server_config.harnessDisabled: string[]` + `discovery.disabled` stamped **in the route handler** + caller-supplied `select()` `disabledTypes` gate with a **hard `builtin` exemption** + `POST /api/harnesses/:type/disabled` with `:type`-validation + builtin-reject. The prior draft's collisions are now corrected: (a) the pool is DB-free so the caller passes `disabledTypes` (CHANGE 1) — not a DB read inside the sync `select()`; (b) a fully-disabled fleet degrades gracefully because `builtin` is hard-exempt in BOTH `showsToggle` and `select()` (CHANGE 2) — the always-present fallback can never be stranded; (c) `discovery.disabled` is stamped at the route, not the DB-free `listCapabilityDescriptors()` (CHANGE 3); (d) `discovery.disabled?: boolean` is additive on `HarnessDiscoveryStatus` — AM2/AH2 contract tests still pass. Residual: settings-write concurrency with `refreshDiscoveries` is benign (separate fields; both atomic single-thread reassigns). `@lore` at `showsToggle`/`select()` documents the consumer.
3. **Redetect latency** — `discoverLocalHarnesses()` runs CLI probes; can take ~1-2s. The Re-detect button needs an in-flight state (button disabled + label "Detecting…"). Build detail, not a blocker.
4. **AM3 overlap on `adapter-pool.ts`** — AM3 plans to wire the session probe into the same discovery pipeline. The `refreshDiscoveries` addition should not conflict (different method), but note in `sharedFiles`.
