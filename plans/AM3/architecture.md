# AM3 — Session dial-in & activity view — Architecture

Input contracts (fixed, not re-litigated):
- `plans/AM3/design/approved.md` — non-modal right slide-over dial-in (header · foldable descriptor-driven config band · `What happened` activity via `PartList`).
- AM1 Part model — `packages/shared/src/part.ts`, `docs/human-interface-layer/part-model.md`. Activity renders through `PartList` + the `derivePartsFromSession` adapter. NO duplicated renderer (hard-rule 4).
- AM2 capability descriptor — `packages/shared/src/harness/harness-capability-descriptor.ts`. Controls render declaratively from declared options. No per-backend branching.

## Required reading (engineer reads before implementing)
- `packages/shared/src/part.ts` — the `Part`/`Embed`/`OpenTarget` vocabulary + the `derivePartsFromSession()` stub (the seam this WP fills).
- `docs/human-interface-layer/part-model.md` — §"Where it renders", hard-rules 1–6, the AM1↔AM3 reuse boundary.
- `packages/web/src/components/PartList.tsx` + `parts/*` + `parts/embeds.tsx` — the renderer this WP reuses unchanged.
- `packages/shared/src/harness/harness-capability-descriptor.ts` — `HarnessCapabilityDescriptor`, `HarnessModelDescriptor`, `HarnessModelOptionDescriptor`, `HarnessModelOptionControl`.
- `packages/web/src/hooks/useSessionActivity.ts` — the NORMALIZED `ActivityEntry` union + statuses (the adapter's source).
- `packages/web/src/components/SessionActivityPanel.tsx` — the superseded panel (scroll-pause logic to carry forward).
- `packages/web/src/services/open-handler.ts` — the `session` `OpenTarget` no-op (the entry hook).
- `packages/server/src/routes/harnesses.ts` + `sessions-routes.ts` (`GET /:id/activity`) — the descriptor + activity endpoints.
- `plans/AM3/design/approved.md`, `plans/AM3/design/synthesis.md`.
- `packages/web/src/components/sessionDialInFixtures.tsx`, `SessionDialInSide.stories.tsx` — the approved embodiment (the build target).

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "reuse AM1's shared rendering structure" | `derivePartsFromSession()` exists as a stub returning `[]`; `PartList` is source-agnostic and lint-guarded against source imports | Grow `derivePartsFromSession` into the real adapter; render through `PartList` unchanged. |
| "render controls from the descriptor" | `/api/harnesses` already returns `HarnessCapabilityDescriptor[]`; `HarnessModelOptionDescriptor.control` carries the control kind | Controls dispatch on `control.kind`; no new endpoint for the descriptor list. |
| "same session uniform regardless of backend" (AC4) | `useSessionActivity` returns ALREADY-NORMALIZED `ActivityEntry` (server normalizes via the activity buffer + `tool_call_recorded` event). The hook is backend-agnostic. | **The adapter consumes `ActivityEntry[]` DIRECTLY** — no parallel type. `ActivityEntry` IS the normalized backend-agnostic shape AC4 relies on; mirroring it into a second shape adds a translation layer with no consumer. Normalization is upstream (AM2) → AC4 holds by construction. The adapter never sees a harness type. |
| **activity entry kinds that ACTUALLY exist** | The server buffer (`SessionActivityBuffer.start`) only ever appends `type:"tool_call"` (from `tool_call_recorded`). `session_ended` transitions STATUS, not an entry. `reasoning` + `cost_tick` are in the `ActivityEntry` union but **no producer emits them** today, and there is **NO edit/diff entry anywhere**. | **The adapter handles `tool_call` → prose (real, the only emitted kind), `reasoning` → prose, `cost_tick` → excluded (cost is header chrome). `edit`/`diff` is DROPPED — no producer, so an adapter branch for it would be dead code the AC4 test asserts over a runtime-impossible shape.** Diff capture is a later WP (the buffer must first record file edits). Fixture + approved.md updated to match (tool-call prose only, zero diff Embeds). |
| "enter from a session reference" | The `session-reference` Embed renders as a `Fold` "Show session" → `onOpen({route:"session", sessionId})`; `createOpenHandler`'s `session` case is a documented no-op | Wire the `session` case to open the panel. Entry is panel-state on the conversation page, NOT a new route (avoids rejected Variant B). |
| activity entries map to a Part kind | The closed `PartKind` is `prose | review | resolved | questionnaire | unknown` — no `tool-call`/`activity` kind | DESIGN-IT-TWICE below. Decision: render each activity entry as a `prose` Part (zero `PartKind` change, zero renderer change, zero Embed — there is no diff to embed). |
| config write target (AC2) | PATCH `/sessions/:id` exists but writes **state + effectiveness only** — no model/option config. `POST /sessions` launch body takes `modelTier` only. **No durable model/option-config write surface exists** for a live/ended session, and a session already running cannot be retroactively reconfigured (the harness run is in-flight/done). | **`onConfigure` updates page-held controlled config state (the selected pill changes — a real, visible effect satisfying AC2 "the control does something"). Durable/launch persistence is an explicitly-named deferred seam, NOT invented here.** See "Config write path" below + Task 4/7. |
| descriptor↔session link | `GET /sessions/:id/activity` returns `session.agentId`; agents carry `harnessType` (`users.harnessType`, nullable); `/api/harnesses` is deduped by `type` | Resolve the descriptor for a session by the session's agent `harnessType` → matching descriptor. Add the agent's `harnessType` to the activity response. See Task 5. |

No spec/doc contradiction found. No `/concept` gap.

## Design-it-twice: how session activity becomes Parts

**Option 1 — Activity as `prose` Parts (CHOSEN).**
`derivePartsFromSession(entries, agent)` maps each `ActivityEntry` to a `prose` Part authored by the agent: `tool_call` → prose (e.g. "Edited auth/passkey.ts …" / "Ran the test suite — 14 passed"), `reasoning` → prose (the excerpt). `cost_tick` is summarized into the header status, NOT a Part (cost is chrome, not activity reading). **No `diff`/`edit` mapping** — the activity stream emits no edit/diff entry (the buffer records only `tool_call`), so an `edit`→`diff`-Embed branch would be dead code. Embeds are `[]` for every activity Part this WP.
- Trade-off: tool-calls don't get bespoke chrome (an icon-prefixed chip) and edits don't surface a clickable diff chip; they read as agent prose lines. Acceptable — the design's "What happened" column is calm prose, matching AM1's concept (§Part: a session text event IS a prose Part). When the buffer learns to capture file diffs (later WP), the adapter grows a `diff` Embed then — not before a producer exists.
- Reject reason for the alternative: none strong enough to pay its cost.

**Option 2 — Extend `PartKind` with `tool-call` / `activity`.**
Add a closed `tool-call` Part kind with its own renderer in `parts/` and exhaustive dispatch in `PartList`.
- Trade-off: richer activity chrome (tool icon, status, args) BUT changes the closed `PartKind` union (touches `part.ts`, every exhaustive switch, the conversation renderer's snapshot) and risks the activity column drifting from the conversation's calm prose — the opposite of the uniformity AC3 demands.
- Reject: higher blast radius, weaker uniformity, no design requirement for bespoke tool chrome this WP.

**Synthesis:** Ship Option 1. If a future WP needs distinct tool chrome, extend the CLOSED `PartKind` union (and its exhaustive dispatch) — never a parallel renderer. The adapter is the only new logic; the renderer is untouched (AC3 proof = the lint boundary on `PartList`/`parts/**` stays green with the new adapter).

## Acceptance criteria + verification

**AC1 — Enter the lower-level session view from a session reference, not in the default conversation flow.**
- Verify: unit test on `createOpenHandler` — `onOpen({route:"session", sessionId:"s-1"})` invokes the supplied `onOpenSession(sessionId)` callback (new ctx hook) and does NOT navigate. Component test: the conversation page, given a `session-reference` Fold, opens the `SessionDialIn` panel on click; the panel is a sibling surface, NOT a Part in the conversation column (assert the panel renders OUTSIDE `[data-ds-component="PartList"]`).

**AC2 — Configure the session from the harness's DECLARED options (model + effort/mode/permission), not hard-coded per backend.**
- Verify: component test renders `DialInControls` with a descriptor that declares `effort`+`mode`+`permission` → all three controls present, control kind matches `control.kind` (select → option pills, boolean → Checkbox, number/text → Input). Second test: a descriptor whose selected model declares NO options → only the model row renders; effort/mode/permission rows ABSENT (query by label, assert not-in-document). No `harnessType`/`type` string appears in `DialInControls` branching (lint/grep: no `switch`/`if` on a harness type in the controls file).
- **The control does something real** (AC2 "configure the session"): component test clicks a non-active option pill → `onConfigure({key,value})` fires with that key/value AND the controlled `config` re-renders that pill as active (selection visibly changes). Persistence beyond the page-held config state is a deferred seam (see "Config write path") — but the control is NOT a no-op.

**AC3 — "What happened" activity renders REUSING the conversation's Part structure (no duplicated renderer).**
- Verify: unit test — `derivePartsFromSession(FIXTURE_ENTRIES, agent)` returns `Part[]` (every item satisfies the `Part` discriminant). Component test — the dial-in panel renders activity via `<PartList>` (assert `[data-ds-component="PartList"]` present inside the panel). Static: the existing `no-restricted-imports` ESLint boundary on `PartList.tsx`/`parts/**` stays green (no source-type import added) — proven by `npm run lint` (builder).

**AC4 — The same session renders uniformly regardless of which backend produced its activity.**
- Verify: unit test — feed `derivePartsFromSession` two `ActivityEntry[]` fixtures representing the SAME actions captured from two different backends (already normalized to the `ActivityEntry` shape) → assert the produced `Part[]` are structurally identical (same kinds, same text). The adapter signature accepts `ActivityEntry[]` only — no harness-type parameter (compile-time proof the renderer can't branch on backend).
- **Honest scope of this test:** both fixtures are hand-authored in the already-normalized `ActivityEntry` shape, so this proves the **adapter is deterministic** — NOT that two real backends normalize to the same `ActivityEntry`. That upstream backend→`ActivityEntry` normalization is **AM2's proven contract**, correctly out of AM3 scope and not re-tested here.

## Type signatures / contracts

```ts
// packages/shared/src/part.ts — grow the existing stub. The ONLY new source adapter.
// Source = NORMALIZED ActivityEntry (backend-agnostic) consumed DIRECTLY — NO
// parallel `SessionActivityEvent` type. ActivityEntry is already the normalized
// shape AC4 relies on; reshaping it into a second type adds a translation layer
// with no consumer. `ActivityEntry` is lifted into shared (Task 1) so the adapter
// (shared) and the hook (web) + buffer (server) reference ONE definition.

// Lifted from packages/web/src/hooks/useSessionActivity.ts + the identical copy
// in packages/server/src/services/session-activity-buffer.ts — UNCHANGED shape:
export type ToolCallData  = { toolName: string; argsSummary: string };
export type ReasoningData = { excerpt: string };
export type CostTickData  = { deltaMinor: number; totalMinor: number; currency: string };
export type ActivityEntry =
  | { type: "tool_call";  timestamp: number; data: ToolCallData }
  | { type: "reasoning";  timestamp: number; data: ReasoningData }
  | { type: "cost_tick";  timestamp: number; data: CostTickData };

export function derivePartsFromSession(
  entries: ReadonlyArray<ActivityEntry>,
  agent: PartAuthor,            // the session's agent — sole author of every activity Part
): Part[];
// Maps tool_call → prose Part ("Edited …" / "Ran …" from toolName+argsSummary),
// reasoning → prose Part (the excerpt), cost_tick → SKIPPED (header chrome).
// Every Part: kind "prose", author=agent, embeds=[], createdAt=new Date(timestamp).toISOString().
// Dispatch is exhaustive over ActivityEntry["type"] (exhaustiveAssert on the default).
// NO diff/edit branch — no producer emits one (see reconciliation table).
```

```ts
// packages/web/src/components/SessionDialIn.tsx — the NEW web composition (one surface, prop-driven, story+page).
export interface SessionDialInProps {
  readonly header: {
    agentName: string;
    taskTitle: string;
    status: "live" | "ended";
    statusLabel: string;
    // Running cost — the cost_tick total, formatted via formatMoney (carries AF10-AC5
    // surface-1 coverage forward from the deleted SessionActivityPanel). null when no cost.
    cost: { readonly minor: number; readonly currency: string } | null;
  };
  readonly descriptor: HarnessCapabilityDescriptor;     // resolved from the session's agent harnessType
  readonly config: Record<string, string>;              // current option values keyed by option.key (page-held, controlled)
  readonly onConfigure: (change: { key: string; value: string }) => void;  // page updates `config` (visible effect); durable persistence is a deferred seam
  readonly parts: ReadonlyArray<Part>;                  // derivePartsFromSession(...) output (prose only — no embeds)
  readonly onOpen: OpenHandler;                         // reserved for future embed routing; activity Parts carry no embeds this WP
  readonly onClose: () => void;
}
```

```ts
// packages/web/src/services/open-handler.ts — wire the session case.
export interface OpenHandlerContext {
  readonly betId?: string | null;
  readonly onOpenSession?: (sessionId: string) => void;  // NEW — page opens the panel; no navigation.
}
// case "session": ctx?.onOpenSession?.(target.sessionId); return;   (still a no-op when unbound)
```

## Config write path (AC2 — resolved, not deferred-to-builder)

The descriptor options (model · effort · mode · permission) are **launch-scope** (`HarnessModelOptionDescriptor.scope` is `launch | durable`). Hard constraints from the codebase:
- A session shown in the dial-in is **live or ended** — its harness run is in-flight or finished. It **cannot be retroactively reconfigured**; there is no "edit a running session's model" operation.
- The only session writes that exist are `PATCH /sessions/:id` (**state + effectiveness only**) and `POST /sessions` (launch body takes **`modelTier` only**). **No route persists model/effort/mode/permission config**, and adding a durable agent-config write endpoint is a NEW write surface — out of AM3 scope and rejected for scope tightness.

**Resolution (concrete, AC2-satisfying):** `onConfigure` updates **page-held controlled `config` state** on the conversation page. The clicked option becomes the active pill (a real, visible effect — AC2's "the user can configure the session" is met: the control changes the session's displayed configuration, not a no-op). This is the launch-config the user is composing for re-running / forking this work.

**Named deferred seam (NOT invented here):** durable persistence (writing the chosen config to a session-launch payload or the agent's `modelId`/`reasoning` columns) is **out of scope for AM3** and is the seam a future "relaunch session with config" WP fills. The plan states this explicitly so the builder does not invent a write endpoint.

- **Route checklist for the write:** NONE. AM3 adds no write route. `onConfigure` mutates React state only. (This is why the Security section's "rate-limit on write" is N/A — there is no AM3 write.)

## Ordered task list

1. **Lift `ActivityEntry` (UNCHANGED shape) → shared** (`packages/shared/src/session-activity.ts`; re-export from `index.ts`). This is a true *lift*, not a reshape: the SAME `{type, timestamp:number, data}` union is currently duplicated verbatim in `packages/web/src/hooks/useSessionActivity.ts:31` AND `packages/server/src/services/session-activity-buffer.ts:22`. Move ONE canonical copy to shared; re-point both call sites' imports (their runtime shape is identical, so no remap). **Do NOT introduce a parallel `SessionActivityEvent` type — it is deleted from the plan.** Test: type round-trips through shared; the existing buffer + hook tests stay green after the import swap. **Files:** `packages/shared/src/session-activity.ts`, `packages/shared/src/index.ts`, `packages/web/src/hooks/useSessionActivity.ts` (import swap), `packages/server/src/services/session-activity-buffer.ts` (import swap). **Shared file.**
2. **Implement `derivePartsFromSession(entries, agent)`** (replace the `[]` stub). Dispatch on `ActivityEntry["type"]`: `tool_call` → `prose` Part (text from `toolName` + `argsSummary`), `reasoning` → `prose` Part (text from `excerpt`), `cost_tick` → SKIP (no Part — header chrome). `createdAt = new Date(entry.timestamp).toISOString()`; `author = agent`; `embeds: []`. Exhaustive over the union (`exhaustiveAssert` on default). **NO `edit`/`diff` branch — no producer emits one** (only `tool_call` is emitted today; `reasoning`/`cost_tick` are handled for forward-compat but unemitted). Proves AC3+AC4. Test: `AM1-part.test.ts` (or a new `AM3-session-adapter.test.ts`) — fixture entries → `Part[]` (all `prose`); `cost_tick` yields no Part; cross-backend identical fixtures → identical Parts. **Files:** `packages/shared/src/part.ts`.
3. **Wire the `session` `OpenTarget`** — add `onOpenSession` to `OpenHandlerContext`; `case "session"` calls it (no navigation). Proves AC1 (entry, no flow promotion). Test: `open-handler.test.ts` — session target invokes the callback, never navigates. **Files:** `packages/web/src/services/open-handler.ts`. **Shared file.**
4. **Build `DialInControls`** (promote from the design fixture `sessionDialInFixtures.tsx` into a production component). Dispatch on `HarnessModelOptionControl.kind`: `select`→option pills, `boolean`→DS `Checkbox`, `number`/`text`→DS `Input`. Model row over `descriptor.models.filter(selectable)`. Undeclared option ⇒ absent. Proves AC2. Test: `DialInControls.test.tsx` (two descriptors: full options vs none). **Files:** `packages/web/src/components/DialInControls.tsx` + `.stories.tsx`.
5. **Resolve the descriptor for a session.** `harnessType` IS on the agent (users) schema (`packages/db/src/schema.ts:71`, nullable). Add the agent's `harnessType` to the `GET /sessions/:id/activity` response (it already returns `session.agentId`/`modelTier` — join `users.harnessType` on `session.agentId`, return `session.harnessType: string | null`). The dial-in resolves `harnessType` → descriptor from the `/api/harnesses` list (deduped by `type`). Add a small `useHarnessDescriptor(harnessType)` selector over the existing harnesses fetch. **Null-`harnessType` fallback — ONE chosen behavior: resolve the `builtin` descriptor** (the always-present in-process harness; every install has it, so a null never yields an empty control surface — the model row always renders). Model-row-only is NOT the fallback. Test: integration test on the activity route asserts `harnessType` in the response (incl. a null case); unit test on the selector asserts `useHarnessDescriptor(null)` returns the `builtin` descriptor. **Files:** `packages/server/src/routes/sessions-routes.ts`, a web hook `useHarnessDescriptor.ts`. **Shared file (sessions-routes).**
6. **Build `SessionDialIn`** (the non-modal slide-over composition: header + `Fold` + `DialInControls` + `PartList`). Prop-driven, one surface for story + page (mirror `ConversationSurface`'s no-drift pattern). Carry `SessionActivityPanel`'s scroll-pause logic for the live state. **Header cost chip:** when `header.cost` is set, render the running cost via `formatMoney(header.cost)` (carries the deleted panel's AF10-AC5 surface-1 money contract — zero-decimal currencies render correctly, no hardcoded `/100`). Proves AC1/AC3 composition. Test: `SessionDialIn.test.tsx` — renders `PartList`, renders controls, close fires `onClose`, panel is NOT inside the conversation column, AND `header.cost={minor:150,currency:"JPY"}` renders `¥150` (no `1.5`). **Files:** `packages/web/src/components/SessionDialIn.tsx` + `.stories.tsx`.
7. **Wire into the conversation page** — `Conversations.tsx` holds `openSessionId` panel state + the page-held controlled `config` (Record<string,string>) updated by `onConfigure`; binds `createOpenHandler(navigate, { betId, onOpenSession: setOpenSessionId })`; renders `<SessionDialIn>` beside `<ConversationSurface>` when `openSessionId` set; feeds `useSessionActivity(openSessionId)` → `derivePartsFromSession` for `parts`, and derives `header.cost` from the LAST `cost_tick` entry (`{minor: data.totalMinor, currency: data.currency}`, else null). Proves AC1 end-to-end. Test: E2E/component — open Fold → panel appears beside conversation; ✕ closes; focus restores. **Files:** `packages/web/src/pages/Conversations.tsx`.
8. **Supersede `SessionActivityPanel`** — RECONCILED: `Conversations.tsx` already mounts `SessionActivityPanel`. AM3 replaces that mount with `SessionDialIn` (Task 7 IS this reroute). Then delete `SessionActivityPanel.tsx` + `.stories.tsx` + `SessionActivityPanel.test.tsx`. **The 3 "importing" tests — grep-verified per file, NOT builder's-discretion:**
   - **`AF10-money-surfaces.test.tsx` (line 243/273) — REALLY renders `SessionActivityPanel` and asserts surface-1 `cost_tick` JPY money formatting (¥150, no `/100`). This coverage is MANDATORY to re-home, not optional.** `cost_tick` is dropped from the activity *Part* stream (header chrome, not a Part), so the money-format moves to the dial-in's cost surface. **Re-home: rewrite AF10 surface-1 to render `SessionDialIn` (or its `DialInHeader` cost chip) fed a `cost_tick` and assert the same `formatMoney(JPY)` output (¥150, no `1.5`).** `SessionDialIn`/`DialInHeader` MUST format the running cost via `formatMoney` (carry the cost-display responsibility forward — this is the AF10-AC5 contract). Do NOT delete the assertion.
   - **`L17-money-web.test.tsx` — does NOT import or render `SessionActivityPanel`** (grep-confirmed: tests `ArtifactCostChip` only). The critique's premise is stale for this file. **No change required.**
   - **`EmptyState.compact.test.tsx` — does NOT import or render `SessionActivityPanel`** (grep-confirmed: only a code-comment mentions it; tests render `EmptyState` directly). **No change required** beyond optionally updating the stale comment.
   - Verify: `grep -rn "SessionActivityPanel" packages/web/src` returns zero after (component + stories + its own test deleted; AF10 re-pointed to the new surface). **Files:** `packages/web/src/components/SessionActivityPanel.{tsx,stories.tsx}`, `SessionActivityPanel.test.tsx`, `AF10-money-surfaces.test.tsx`.
9. **Re-bless web catalog snapshot** for the 3 design stories + new production stories (builder, green phase only). **Not the designer's job.**

## Migrations
- **`SessionActivityPanel` supersession (Task 8) — RECONCILED importers:**
  - `packages/web/src/pages/Conversations.tsx` — `reroute` to `SessionDialIn` (Task 7).
  - `packages/web/src/components/SessionActivityPanel.{tsx,stories.tsx}` — `delete`.
  - `packages/web/src/__tests__/SessionActivityPanel.test.tsx` — `delete`.
  - `packages/web/src/__tests__/AF10-money-surfaces.test.tsx` — `retarget` (Task 8): surface-1 RENDERS `SessionActivityPanel` (line 273) and asserts `cost_tick` JPY money formatting. Re-home that assertion to the dial-in cost surface (`formatMoney`); do NOT drop it.
  - `L17-money-web.test.tsx`, `EmptyState.compact.test.tsx` — **NO change** (grep-confirmed: neither imports/renders `SessionActivityPanel`; the critique's premise was stale for these two).
- **`ActivityEntry` lift to shared (Task 1).** UNCHANGED shape, moved to `packages/shared/src/session-activity.ts`. Re-point the two verbatim-duplicate definitions' imports: `packages/web/src/hooks/useSessionActivity.ts` (its `ActivityEntry`/`ToolCallData`/… exports re-export from shared) and `packages/server/src/services/session-activity-buffer.ts` (same). No remap — the runtime shape is identical. `SessionActivityPanel.tsx` is deleted (Task 8), so it needs no migration.

## Route checklist
- `case "session"` in `createOpenHandler` (`open-handler.ts`) — the ONLY routing seam touched. No new URL route (entry is panel state, not navigation — deliberately, to avoid promoting the session to a first-class route per the rejected Variant B). Confirm no other `OpenTarget.route` handling changes.

## Security & abuse cases
- **Rate-limit / write endpoint:** N/A — **AM3 adds NO write route** (see "Config write path"). `onConfigure` mutates page-held React state only; `GET /sessions/:id/activity` (read) is the only server touch and is unchanged except for the additive `harnessType` field. There is no rate-limit surface because there is no AM3 write.
- **Input-trust boundary for agent-authored fields:** activity `summary`/`toolName`/`argsSummary`/`excerpt` are agent-authored → render as React-escaped TEXT only (prose renders as text, never HTML). Assert no `dangerouslySetInnerHTML` in the activity path.
- **Secret-handling:** N/A — the descriptor is non-secret (the `/api/harnesses` `public-data` boundary already established); no credential surface in the dial-in.
- **Path-traversal / SSRF:** N/A — no path or outbound-URL input.
- **Descriptor over-trust:** the dial-in renders ONLY declared options; an undeclared option is absent (AC2) — a malformed descriptor can't inject a control kind outside `HarnessOptionControlKind` (the union is closed; unknown kind → render nothing, no throw).

## protectedTests
- `packages/shared/src/__tests__/AM1-part.test.ts` — the frozen `derivePartsFromMessages` contract. AM3 fills the SESSION adapter only; the conversation (`Message`→`Part`) adapter's behavior must not change. Stays green.
- `packages/shared/src/__tests__/AM1-source-agnostic.test.ts` — the source-agnostic import boundary (the renderer imports no source type). The AC3 reuse proof. Stays green.
- The `no-restricted-imports` ESLint boundary config for `PartList.tsx`/`parts/**` — must stay (the static half of the AC3 reuse proof).
- (Money) `packages/web/src/__tests__/AF10-money-surfaces.test.tsx` — surface-1 is RE-HOMED, not dropped (Task 8); the `formatMoney(JPY)` assertion survives on the new dial-in cost surface.

## sharedFiles
- `packages/shared/src/session-activity.ts` (NEW — the lifted `ActivityEntry` union), `packages/shared/src/part.ts`, `packages/shared/src/index.ts` (adapter + type lift re-export)
- `packages/web/src/hooks/useSessionActivity.ts`, `packages/server/src/services/session-activity-buffer.ts` (import swap to the lifted type)
- `packages/web/src/services/open-handler.ts` (session case)
- `packages/server/src/routes/sessions-routes.ts` (harnessType in activity response)
- `packages/web/src/pages/Conversations.tsx` (panel wiring + page-held config)

## Risks / ambiguities (RESOLVED in round-1 revision — see "Critique resolution")
1. **Config persistence scope** — RESOLVED: AM3 is render-controls + page-held controlled config (`onConfigure` → visible pill change = AC2 met). Durable/launch persistence is a named, deferred seam; NO new write endpoint. (See "Config write path".)
2. **Activity diff/edit entry** — RESOLVED: dropped; no producer emits one. Activity is tool-call prose only this WP; diff capture is a later WP.
3. **`harnessType` in the activity response** — RESOLVED: add the additive `harnessType` field to the existing `GET /:id/activity` response (cheap; already returns agent context). Null `harnessType` → `builtin` descriptor (Task 5).

## Critique resolution (round 1)

Critique: `plans/AM3/architecture-critique.md` (7/10, rounds=1). Three WARNINGs + four SUGGESTIONs.

**WARNING 1 — DM/CC-007: `diff`/`edit` activity entry does not exist in the real data path.**
Resolved via option (a) — DROPPED `edit`/`diff`. Grep-verified the runtime: `SessionActivityBuffer.start` appends only `type:"tool_call"` (from `tool_call_recorded`); `session_ended` transitions status, not an entry; `reasoning`/`cost_tick` are in the union but no producer emits them; there is no edit/diff entry anywhere. The adapter now maps `tool_call`→prose, `reasoning`→prose (forward-compat), `cost_tick`→header chrome (skipped), with NO diff branch. Updated `sessionDialInFixtures.tsx` (the two diff Embeds replaced with tool-call prose — `SESSION_PARTS` now has `embeds:[]` throughout) and `design/approved.md` (component map + activity description) so design and plan agree. Diff capture is named as a later WP (buffer must first record file edits).

**WARNING 2 — DM: the "lift" is actually a reshape.**
Resolved by DROPPING the parallel `SessionActivityEvent` type entirely. The adapter consumes `ActivityEntry` directly — its real `{type, timestamp:number, data}` shape — since `ActivityEntry` is already the normalized backend-agnostic shape AC4 relies on; a second shape would add a translation layer with no consumer. Task 1 is now a TRUE lift (the identical union is duplicated verbatim in the web hook + server buffer → move one canonical copy to `packages/shared/src/session-activity.ts`, re-point both imports, no remap). Type signatures + task list updated.

**WARNING 3 — FMC: config-write path unspecified.**
Resolved with a concrete, AC2-satisfying decision (new "Config write path" section). A live/ended session cannot be retroactively reconfigured and NO existing route persists model/effort/mode/permission config; adding one is out of scope. So `onConfigure` updates page-held controlled `config` state — the clicked option becomes active (a real, visible effect: the control does something). Durable/launch persistence is an explicitly-named deferred seam, not invented. Route checklist for the write: NONE (no AM3 write route). AC2 verification updated to assert the visible config change.

**SUGGESTIONs (all addressed):**
- protectedTests now cite the real paths `AM1-part.test.ts` + `AM1-source-agnostic.test.ts` (dropped the "(if present)" guess).
- Task-5 null-`harnessType` fallback fixed to ONE behavior: resolve the `builtin` descriptor (always present → never an empty control surface), with the named test assertion.
- Task-8 no longer leaves coverage to builder discretion: grep-verified each importer — `AF10-money-surfaces.test.tsx` REALLY renders the panel and asserts `cost_tick` JPY money (MANDATORY re-home to the dial-in `formatMoney` cost chip; `SessionDialIn.header.cost` + Task 6/7 carry it); `L17`/`EmptyState.compact` do NOT import the panel (stale premise → no change).
- AC4 verification annotated honestly: the adapter test proves adapter DETERMINISM, not real cross-backend normalization (that is AM2's upstream contract, out of AM3 scope).
