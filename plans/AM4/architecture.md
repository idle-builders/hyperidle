# AM4 — Harness detection & onboarding — Architecture

Input contracts (fixed, not re-litigated): `plans/AM4/design/approved.md` (Variant C), AM2 capability descriptor (`docs/agent-layer/harness-capability-descriptor.md`), `.pipeline/work-packages/TRACK-AM.md` § AM4.

## Summary

AM4 is a **frontend composition** plus **one small backend endpoint**. The read path is already shipped by AM2: `GET /api/harnesses` → `HarnessCapabilityDescriptor[]` returns the full list including missing/unauthenticated families, with discovery state, version, auth action, models, and runtime caps. The only backend gap is the "**on demand**" re-detection AC: production discovery runs once at boot and is frozen into the `AdapterPool` (`createLocalAdapterPool` → `discoverLocalHarnesses`, then `Object.freeze`). A re-fetch returns the same snapshot. We add a single `POST /api/harnesses/redetect` that re-runs the public probes and refreshes the pool's discovery snapshot.

Everything else is a new `SettingsHarnesses` web section + `HarnessCard` sub-component composing existing DS primitives, driven entirely by the descriptor through the `harness-presentation` mappers (zero per-backend branching).

## Required reading (engineer reads ONLY these)

- `plans/AM4/design/approved.md` — the visual contract + component mapping (authoritative for UI).
- `docs/agent-layer/harness-capability-descriptor.md` — descriptor fields + readiness states.
- `packages/shared/src/harness/harness-capability-descriptor.ts` — the types to import.
- `packages/server/src/routes/harnesses.ts` — the existing route + its `@lore` (do NOT add an in-route key check).
- `packages/server/src/harness/adapter-pool.ts` — `listCapabilityDescriptors`, `discoveries`, `createLocalAdapterPool`.
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
| Enable/disable a backend | No `enabled` field on descriptor or schema; agents carry `harnessType` (`db/schema.ts:71`) | **Design decision §B** — toggle is display-only/derived in AM4 (no new persisted state). Documented below. |
| `enter_api_key` action target | builtin credential lives via gateway/`safeStorage`; `SettingsModels` shows `hasApiKey` | Auth CTA for `enter_api_key` routes to the existing credential surface; AM4 builds NO new storage. |
| StatusChip supports needed statuses | EXISTS — `healthy|behind|paused|blocked|done|error` + `"unknown"` sentinel | `readinessToStatus` maps to `healthy/behind/paused/unknown`. |

No spec/doc contradiction requiring a `/concept` reopen.

## Design-it-twice

### A. "On demand" re-detection — endpoint vs client-only

- **Option A1 — `POST /api/harnesses/redetect`** re-runs `discoverLocalHarnesses()` server-side and replaces the pool's discovery snapshot, returns the fresh `HarnessCapabilityDescriptor[]`. Trade-off: needs the pool to expose a `refreshDiscoveries()` mutator (the field is currently `private readonly` + frozen). Reject reason: adds a mutable path to a deliberately-immutable structure — must be done carefully.
- **Option A2 — client just re-GETs `/api/harnesses`.** Trade-off: zero backend work. Reject reason: returns the **same boot-time snapshot** — a user who runs `codex login` then clicks "Re-detect" still sees `unauthenticated`. Fails the AC's spirit ("on demand" detection) and the "actionable next step" loop (the user can't verify their action worked).

**Synthesis → A1.** Add `AdapterPool.refreshDiscoveries(): Promise<void>` that calls `discoverLocalHarnesses()` and reassigns the snapshot (drop `readonly`; keep the freeze on each reassignment). `POST /api/harnesses/redetect` calls it then returns `listCapabilityDescriptors()`. This makes the detection loop honest: act → re-detect → state changes. The GET stays the cheap boot-snapshot read for first paint.

### B. Enable/disable persistence — new state vs derived

- **Option B1 — new persisted per-harness `enabled` flag** (new table or settings key). Trade-off: a real toggle that survives restart. Reject reason: AM2's descriptor has no `enabled` field, there is no consumer of it yet (agents pick `harnessType` directly; the gateway/pool don't gate on an enabled flag), and the spec's out-of-scope line is "credential storage mechanics" — adding a new persistence layer + its enforcement is scope the AC doesn't demand and that no runtime reads.
- **Option B2 — toggle reflects readiness, no new persisted state.** A backend is "on" iff `discovery.state === "ready"`; the toggle is the affordance to *make it ready* (disabled until ready, since the path to "on" is authentication, not a flag). Trade-off: the toggle isn't a free on/off switch. Reject reason: a user might want to hide a ready backend.

**Synthesis → B2 for AM4, RULED by the architecture-critique. No B1.** No persisted enable/disable state. "Enable/disable/configure" in the AC is satisfied by: enable = complete the auth action (→ ready), configure = the capability fold + (for builtin) the existing credential/model surface, disable = N/A at the harness level in AM4 (no runtime consumes a disabled flag, so a persisted disable would be dead state and the control would lie). **The original B2 was itself under-specified** (it rendered a permanently-disabled toggle on `unauthenticated`, reading as a broken control). The bound resolution (design R1 + arch-critique ruling): NO interactive toggle at all — a non-interactive "Enabled" label on `ready` only, no indication elsewhere. B1 (one settings key `harness.disabled: string[]`) is a follow-up gated strictly on a future runtime consumer; do not build dead state speculatively.

## Types & contracts

### Shared (already exist — import, do not redefine)
`HarnessCapabilityDescriptor`, `HarnessReadinessState`, `HarnessAuthActionDescriptor`, `HarnessModelDescriptor`, `HarnessRuntimeCapabilities` from `@hyperidle/shared`.

### New web presentation module (lifted from the design story)
`packages/web/src/settings/harness-presentation.ts` — pure, descriptor-only mappers (the single interpretation point; reviewer greps here to confirm no `type ===` branch):

```ts
export function readinessToStatus(state: HarnessReadinessState): { status: Status | "unknown"; label: string };
export function accessModeLabel(mode: HarnessAccessMode): string;
export function hasActionableNextStep(d: HarnessCapabilityDescriptor): boolean;
export function showsEnabledIndication(d: HarnessCapabilityDescriptor): boolean; // ready-only; non-interactive label
export function hasCaps(d: HarnessCapabilityDescriptor): boolean;               // models OR any proven cap → fold visible
export function provenCapabilities(d: HarnessCapabilityDescriptor): readonly string[]; // only true runtime caps
export function commandText(d: HarnessCapabilityDescriptor): string | null;
export function capabilitySummary(d: HarnessCapabilityDescriptor): string;      // proven caps, else "confirmed after first run"
export function actionableFirst(a, b): number; // sort comparator
```

**Toggle mapper resolution (design-it-twice §B + design R1 + arch-critique ruling).** There is NO interactive `Toggle` and NO `isEnableable`/`showsToggle`. `showsEnabledIndication` returns `true` only for `ready` and the surface renders a **non-interactive "Enabled" label** (not `role=switch`). Rationale: `AdapterPool.select()` (adapter-pool.ts:161-196) gates on capacity / `modelProviders` / `harnessType` — no path consults an `enabled`/`disabled` flag, so a persisted disable would be dead state and a flippable switch would lie. Add a `@lore` at `showsEnabledIndication` recording "derived-from-readiness, not persisted; B1 (persisted flag) is the follow-up only once a runtime consumer exists — do not re-add a persisted flag thinking it was an oversight." The builder lifts this exact shape from `AM4HarnessVariantC.stories.tsx`.

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
```ts
// AdapterPool
async refreshDiscoveries(): Promise<void>;   // re-runs discoverLocalHarnesses(), reassigns this.discoveries
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
| `packages/server/src/harness/adapter-pool.ts` | add `refreshDiscoveries()` (EDIT) |
| `packages/server/src/routes/harnesses.ts` | add `POST /redetect` (EDIT) |

DS primitives reused: `StatusChip`, `Toggle`, `Button`, `Fold`, `KeyValue`, `EmptyState`, `ErrorState`, `SkeletonList`. **No new design-system component.**

## Acceptance criteria → verification

| # | AC (from TRACK-AM § AM4) | Verification |
|---|---|---|
| AC1 | On setup + on demand, reports in-scope backends' presence + auth, with status/version/auth shown | Component test (`SettingsHarnesses.test.tsx`): render with fixture descriptors (builtin ready, codex unauth, claude ready v2.1.170, opencode installed, cursor unavailable); assert each name + its `StatusChip` label + version text present. Redetect: integration test `POST /api/harnesses/redetect` returns 200 + array; a back-to-back second call returns 429 (dedicated limiter); unit test on `refreshDiscoveries` asserts the snapshot is replaced (mock `discoverLocalHarnesses`) AND that runtime caps remain all-`false` afterward (re-detect does not run the session probe — WARNING 4). |
| AC2 | User can enable/disable/configure; declared capabilities (models/options) visible | Component test: ready card renders the non-interactive **"Enabled"** indication (assert the label text present, and assert `queryByRole("switch")` is **null** — there is no toggle, R1); fold "Show" reveals model `KeyValue` rows. **AC2-production-shape (NEW — WARNING 4):** render a `ready` descriptor with runtime caps ALL `false` (the realistic production shape, since discovery does not run the session probe); assert the expanded fold shows the declared model rows AND the "Capabilities confirmed after first run" line, and assert NO "File editing: No"/"MCP: No"/"Sub-agents: No" text appears. (Configure for builtin = link/CTA to existing credential surface — assert the CTA renders.) Do NOT only test the masked all-`true` fixture shape. |
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
- **Ready with unknown runtime caps (the production shape — WARNING 4):** runtime caps are all-`false` because discovery never runs the session probe and re-detect doesn't either. The fold renders declared model rows + "Capabilities confirmed after first run"; the header shows the non-interactive "Enabled" label. This is the default real `ready` card — the fixtures (`AM4HarnessVariants.fixtures.ts`) and `SettingsHarnesses.stories.tsx`/`HarnessCard.stories.tsx` MUST render it (not a masked all-`true` shape), and the AC2-production-shape test asserts it.

## Ordered build tasks

1. **Backend: `AdapterPool.refreshDiscoveries()`** — drop `readonly` on `discoveries`, add async method re-running `discoverLocalHarnesses()` + reassigning the frozen map. Test: `adapter-pool` unit test mocks discovery, asserts snapshot replaced. (no UI dep)
2. **Backend: `POST /api/harnesses/redetect`** — in `routes/harnesses.ts`, same boundary as GET; calls `refreshDiscoveries()` then returns `listCapabilityDescriptors()`. Test: integration `*.integration.test.ts` asserts 200 + array + no-secret leak (mirror AH2 secret assertions). Depends on 1.
3. **Web: `harness-presentation.ts`** — lift from design `AM4HarnessPresentation.ts` (current shape: `showsEnabledIndication`/`hasCaps`/`provenCapabilities`, NO `isEnableable`/`showsToggle`). Add the `@lore` at `showsEnabledIndication` (derived-not-persisted; B1 follow-up). Unit test `harness-presentation.test.ts` per mapper (readiness→status table, `hasActionableNextStep` per state, `showsEnabledIndication` true ONLY for ready, `provenCapabilities` empty when caps all-false → `capabilitySummary` returns "confirmed after first run", `hasCaps`, `commandText`, sort). Plus the **two-descriptor structural-equality test** (Contract row). (no dep)
4. **Web: `HarnessCard.tsx` + stories** — presentational card from approved design (R1 non-interactive "Enabled" label, R2 proven-caps fold). Story states ready/unauth/installed/unavailable, **with runtime caps all-`false` (production shape)** — do not hardcode caps `true`. Add a `missing` story so the install-hint path is rendered+snapshotted (design-critique SUGGESTION). Component test asserts AC2/AC2-production-shape/AC3 per card. Depends on 3.
5. **Web: `SettingsHarnesses.tsx` + stories** — fetch + states + counts + sort + Re-detect button (in-flight disabled state). Component test asserts AC1/AC4 + loading/error/empty/all-ready/ready-with-unknown-caps. Depends on 2,3,4.
6. **Web: register in `SettingsPage.tsx`** — add the "Agent backends" stacked section. Update `W3-settings.test.tsx` if it asserts the section set. Depends on 5.
7. **Lint: descriptor-driven ESLint rule** — add the `no-restricted-syntax` rule (Contract row) banning string-literal comparisons against known harness types within the three harness files; confirm `npm run lint` flags a planted violation then passes clean. (depends on 3,4,5 existing as the scoped files)
8. **Cleanup:** delete the three `AM4HarnessVariant*.stories.tsx`, `AM4HarnessVariants.fixtures.ts`, and `AM4HarnessPresentation.ts` design scaffolds (their essence moved into 3/4/5). Re-bless the DOM-snapshot net for the new + removed stories. **Enumeration-guard note:** deleting 3 variant stories and adding `SettingsHarnesses.stories.tsx` + `HarnessCard.stories.tsx` is a net −1 web settings story. The snapshot-net enumeration guard (`expect(modules.length).toBeGreaterThanOrEqual(56)`, visual-regression.md) counts **design-system** stories (`src/*.stories.tsx` + `src/kinds/*.stories.tsx`), which these web-package files do NOT touch — so the guard is unaffected. Confirm the count still passes after the swap before re-blessing; do NOT lower the threshold (MEMORY: never skip the enumeration guard).

## Route checklist

- `GET /api/harnesses` (exists — read path; no change).
- `POST /api/harnesses/redetect` (NEW — `routes/harnesses.ts`, `requireBoundary({ kind: "public-data" })` + dedicated `createRateLimiter({ limit: 1, windowMs: 5000 })` mounted on this route only, returns fresh descriptors, asserts no secret leak, asserts 429 on a back-to-back second call).

## Security & abuse cases

- **Rate-limit on POST /redetect (WARNING 3 — bound, not deferred):** `discoverLocalHarnesses()` spawns ~10 `execFile` probes (5 families × version+auth), each with a **15 000ms** timeout (harness-discovery.ts:86). The generic 300/min global limiter (app.ts:262) does NOT protect this — 300 calls/min = up to ~3000 concurrent CLI spawns, a local fork-bomb / DoS vector. **Decision (concrete):** mount a dedicated route-scoped `createRateLimiter({ limit: 1, windowMs: 5000 })` on `POST /api/harnesses/redetect` only. One re-detect per 5s per identity; excess returns 429. Verification: integration test fires two redetects back-to-back, asserts the second is 429. The `{ limit, windowMs }` shape matches `RateLimiterOptions` (rate-limit.ts:37-46); the limiter is per-identity (IP/X-API-Key). This is the bound mechanism — do not relax to the global limiter.
- **Secret-handling:** the redetect response is the same descriptor shape that AH2/AM2 already assert never contains `apiKey|baseUrl|sk-|subscriptionToken`. Add the same assertion to the redetect integration test. The auth-action `command` (e.g. `codex login`) is a public CLI command, not a secret — surfacing it is safe.
- **Input-trust:** redetect takes no body; no agent-authored field. N/A.
- **Path-traversal / SSRF:** no path or URL input. N/A.
- **CLI-token harvesting:** AM4 never reads provider credential files; `enter_api_key` routes to the existing credential surface, `native_cli_login` only displays the command. Confirmed by design contract.

## protectedTests
- `packages/server/src/routes/__tests__/AH2-harnesses.integration.test.ts` — the existing GET contract + secret-leak assertions must not change.
- `packages/server/src/harness/__tests__/AM2-harness-capability-descriptors.test.ts` — descriptor shape stays fixed.

## sharedFiles
- `packages/web/src/pages/SettingsPage.tsx` (section registry — other settings WPs touch it).
- `packages/server/src/routes/harnesses.ts` (route file — AM3 dial-in may also extend).
- `packages/server/src/harness/adapter-pool.ts` (AM3 will wire the session probe here — coordinate the `refreshDiscoveries` edit).

## Risks / ambiguities

1. **`refreshDiscoveries` mutability** — the pool was deliberately immutable (AM2 `@lore`). Reassigning a frozen field is safe (freeze is per-object, reassignment replaces the reference) but the builder must keep each new snapshot frozen and ensure no concurrent read sees a half-built map (the reassign is atomic in JS single-thread; the await completes before reassign). Low risk, called out.
2. **Enable/disable semantics (Design-it-twice §B) — RESOLVED.** AM4 ships a non-interactive "Enabled" indication on `ready` only (no toggle, no persisted disable). Ruled correct by the architecture-critique (no runtime consumes a disable flag). No escalation; B1 is a future-only follow-up. `@lore` at `showsEnabledIndication` documents this.
3. **Redetect latency** — `discoverLocalHarnesses()` runs CLI probes; can take ~1-2s. The Re-detect button needs an in-flight state (button disabled + label "Detecting…"). Build detail, not a blocker.
4. **AM3 overlap on `adapter-pool.ts`** — AM3 plans to wire the session probe into the same discovery pipeline. The `refreshDiscoveries` addition should not conflict (different method), but note in `sharedFiles`.
