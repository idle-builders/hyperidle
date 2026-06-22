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

**Synthesis → B2 for AM4, with B1 noted as a follow-up.** The toggle renders ready=on/disabled-elsewhere (matches the approved design). "Enable/disable/configure" in the AC is satisfied by: enable = complete the auth action (→ ready), configure = the capability fold + (for builtin) the existing credential/model surface, disable = N/A at the harness level in AM4 (no runtime consumes a disabled flag, so a persisted disable would be dead state). **The architecture-critique should confirm this read of the AC.** If the reviewer rules a true persisted toggle is required, escalate to B1 (one settings key `harness.disabled: string[]`, read by `SettingsHarnesses` only) — but do not build dead state speculatively.

## Types & contracts

### Shared (already exist — import, do not redefine)
`HarnessCapabilityDescriptor`, `HarnessReadinessState`, `HarnessAuthActionDescriptor`, `HarnessModelDescriptor`, `HarnessRuntimeCapabilities` from `@hyperidle/shared`.

### New web presentation module (lifted from the design story)
`packages/web/src/settings/harness-presentation.ts` — pure, descriptor-only mappers (the single interpretation point; reviewer greps here to confirm no `type ===` branch):

```ts
export function readinessToStatus(state: HarnessReadinessState): { status: Status | "unknown"; label: string };
export function accessModeLabel(mode: HarnessAccessMode): string;
export function hasActionableNextStep(d: HarnessCapabilityDescriptor): boolean;
export function isEnableable(d: HarnessCapabilityDescriptor): boolean;
export function showsToggle(d: HarnessCapabilityDescriptor): boolean;
export function commandText(d: HarnessCapabilityDescriptor): string | null;
export function capabilitySummary(d: HarnessCapabilityDescriptor): string;
export function actionableFirst(a, b): number; // sort comparator
```

(The `readinessToStatus` mapping is a candidate to live with the design-system `status-mapping` family alongside `betStatusToStatus` etc.; the builder may place it there and re-export — it is a reusable status mapping, not AM4-only. Decide in review; functionally identical either way.)

### New backend endpoint
```
POST /api/harnesses/redetect
  auth: requireBoundary({ kind: "public-data" })   // same as GET — matches the @lore boundary
  body: none
  200 → HarnessCapabilityDescriptor[]   // fresh snapshot, identical shape to GET
```
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
| AC1 | On setup + on demand, reports in-scope backends' presence + auth, with status/version/auth shown | Component test (`SettingsHarnesses.test.tsx`): render with fixture descriptors (builtin ready, codex unauth, claude ready v2.1.170, opencode installed, cursor unavailable); assert each name + its `StatusChip` label + version text present. Redetect: integration test `POST /api/harnesses/redetect` returns 200 + array; unit test on `refreshDiscoveries` asserts the snapshot is replaced (mock `discoverLocalHarnesses`). |
| AC2 | User can enable/disable/configure; declared capabilities (models/options) visible | Component test: ready card renders `Toggle` (on, role=switch); fold "Show" reveals model `KeyValue` rows + runtime caps. Assert `getByRole("switch")` + model labels appear after fold open. (Configure for builtin = link/CTA to existing credential surface — assert the CTA renders.) |
| AC3 | Present-but-unauthenticated shows actionable next step, not silent failure | Component test: codex (unauthenticated) card renders the auth zone with primary `Button` text === `authAction.label` ("Log in to Codex") AND the mono command `codex login`. Assert both present. cursor (unavailable) renders reason + NO action button (assert button absent). |
| AC4 | Respects AM2 scope — external backends appear iff in scope | Already locked: AM2 scope = native + external BYO; in-scope kinds surface via the descriptor list. Test: assert the four families + cursor render from the fixture; no out-of-scope kind is fabricated by the UI (UI renders exactly what the descriptor list contains — assert `screen` shows only descriptor-provided names). |
| Contract | Descriptor-driven, zero per-backend branching | **ESLint/static + review:** `harness-presentation.ts` + `HarnessCard.tsx` + `SettingsHarnesses.tsx` contain no `=== "codex"` / `=== "claude-code"` / `=== "opencode"` / `=== "builtin"` / `=== "cursor` literal. Reviewer greps the route-checklist files. (A focused `*.test.ts` can assert the rendered output for two different descriptors uses the same code path by snapshotting structure — but the primary gate is the grep + review.) |
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

## Ordered build tasks

1. **Backend: `AdapterPool.refreshDiscoveries()`** — drop `readonly` on `discoveries`, add async method re-running `discoverLocalHarnesses()` + reassigning the frozen map. Test: `adapter-pool` unit test mocks discovery, asserts snapshot replaced. (no UI dep)
2. **Backend: `POST /api/harnesses/redetect`** — in `routes/harnesses.ts`, same boundary as GET; calls `refreshDiscoveries()` then returns `listCapabilityDescriptors()`. Test: integration `*.integration.test.ts` asserts 200 + array + no-secret leak (mirror AH2 secret assertions). Depends on 1.
3. **Web: `harness-presentation.ts`** — lift from design `AM4HarnessPresentation.ts` into the production location; unit test `harness-presentation.test.ts` per mapper (readiness→status table, actionable predicate for each state, commandText, sort). (no dep)
4. **Web: `HarnessCard.tsx` + stories** — presentational card from approved design; story states ready/unauth/installed/unavailable. Component test asserts AC2/AC3 per card. Depends on 3.
5. **Web: `SettingsHarnesses.tsx` + stories** — fetch + states + counts + sort + Re-detect button. Component test asserts AC1/AC4 + loading/error/empty. Depends on 2,3,4.
6. **Web: register in `SettingsPage.tsx`** — add the "Agent backends" stacked section. Update `W3-settings.test.tsx` if it asserts the section set. Depends on 5.
7. **Cleanup:** delete the three `AM4HarnessVariant*.stories.tsx`, `AM4HarnessVariants.fixtures.ts`, and `AM4HarnessPresentation.ts` design scaffolds (their essence moved into 3/4/5). Re-bless the DOM-snapshot net for the new + removed stories.

## Route checklist

- `GET /api/harnesses` (exists — read path; no change).
- `POST /api/harnesses/redetect` (NEW — `routes/harnesses.ts`, `requireBoundary({ kind: "public-data" })`, returns fresh descriptors, asserts no secret leak).

## Security & abuse cases

- **Rate-limit on POST /redetect:** `discoverLocalHarnesses()` spawns CLI probes (`execFile`) — repeated calls = process-spawn pressure. Applicable. Add a simple in-handler debounce/min-interval (e.g. ignore calls within 2s, return the current snapshot) OR rely on the existing global limiter if present. Builder confirms which; not N/A.
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
2. **Enable/disable semantics (Design-it-twice §B)** — AM4 ships display/derived toggle, not persisted disable. If the reviewer reads AC2 as requiring a true persisted disable, escalate to B1 (one settings key). Flagged for architecture-critique.
3. **Redetect latency** — `discoverLocalHarnesses()` runs CLI probes; can take ~1-2s. The Re-detect button needs an in-flight state (button disabled + label "Detecting…"). Build detail, not a blocker.
4. **AM3 overlap on `adapter-pool.ts`** — AM3 plans to wire the session probe into the same discovery pipeline. The `refreshDiscoveries` addition should not conflict (different method), but note in `sharedFiles`.
