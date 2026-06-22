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
| "same session uniform regardless of backend" (AC4) | `useSessionActivity` returns ALREADY-NORMALIZED `ActivityEntry` (server normalizes via `normalizeHarnessEvent` + activity buffer). The hook is backend-agnostic. | Adapter consumes `ActivityEntry[]` (normalized), NOT raw `HarnessEvent`. Normalization is upstream → AC4 holds by construction. The adapter never sees a harness type. |
| "enter from a session reference" | The `session-reference` Embed renders as a `Fold` "Show session" → `onOpen({route:"session", sessionId})`; `createOpenHandler`'s `session` case is a documented no-op | Wire the `session` case to open the panel. Entry is panel-state on the conversation page, NOT a new route (avoids rejected Variant B). |
| activity tool-calls map to a Part kind | The closed `PartKind` is `prose | review | resolved | questionnaire | unknown` — no `tool-call`/`activity` kind | DESIGN-IT-TWICE below. Decision: render activity as `prose` Parts + the existing `diff` Embed (zero `PartKind` change, zero renderer change). |
| descriptor↔session link | `GET /sessions/:id/activity` returns `session.agentId`; agents carry `harnessType`; `/api/harnesses` is deduped by `type` | Resolve the descriptor for a session by the session's agent `harnessType` → matching descriptor. Needs the agent's `harnessType` (add to the activity response OR a small lookup). See Task 5. |

No spec/doc contradiction found. No `/concept` gap.

## Design-it-twice: how session activity becomes Parts

**Option 1 — Activity as `prose` Parts + Embeds (CHOSEN).**
`derivePartsFromSession(entries, agent)` maps each `ActivityEntry` to a `prose` Part authored by the agent: `tool_call` → prose ("Read auth/passkey.ts …"), `reasoning` → prose (the excerpt), a recorded edit/diff → a prose Part carrying a `diff` Embed (the existing `ReferenceChip`). `cost_tick` is summarized into the header status, not a Part (cost is chrome, not activity reading).
- Trade-off: tool-calls don't get bespoke chrome (an icon-prefixed chip); they read as agent prose lines. Acceptable — the design's "What happened" column is calm prose, matching AM1's concept (§Part: a session text event IS a prose Part).
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

**AC3 — "What happened" activity renders REUSING the conversation's Part structure (no duplicated renderer).**
- Verify: unit test — `derivePartsFromSession(FIXTURE_ENTRIES, agent)` returns `Part[]` (every item satisfies the `Part` discriminant). Component test — the dial-in panel renders activity via `<PartList>` (assert `[data-ds-component="PartList"]` present inside the panel). Static: the existing `no-restricted-imports` ESLint boundary on `PartList.tsx`/`parts/**` stays green (no source-type import added) — proven by `npm run lint` (builder).

**AC4 — The same session renders uniformly regardless of which backend produced its activity.**
- Verify: unit test — feed `derivePartsFromSession` two `ActivityEntry[]` fixtures representing the SAME actions captured from two different backends (already normalized to the `ActivityEntry` shape) → assert the produced `Part[]` are structurally identical (same kinds, same embed kinds, same text). The adapter signature accepts `ActivityEntry[]` only — no harness-type parameter (compile-time proof the renderer can't branch on backend).

## Type signatures / contracts

```ts
// packages/shared/src/part.ts — grow the existing stub. The ONLY new source adapter.
// Source = NORMALIZED ActivityEntry (backend-agnostic). Mirror ActivityEntry's
// shape into shared (today it lives in the web hook) OR accept a minimal
// structural type. Recommended: lift the ActivityEntry union into shared so the
// adapter (shared) and the hook (web) share ONE definition.
export interface SessionActivityEvent {
  readonly kind: "tool_call" | "reasoning" | "edit";   // edit = a recorded diff
  readonly at: string;                                   // ISO timestamp
  readonly toolName?: string;                            // tool_call
  readonly summary?: string;                             // tool_call argsSummary / reasoning excerpt / edit label
  readonly diff?: { readonly artifactId: string; readonly label: string; readonly meta: string };
}

export function derivePartsFromSession(
  events: ReadonlyArray<SessionActivityEvent>,
  agent: PartAuthor,            // the session's agent — sole author of every activity Part
): Part[];                       // prose Parts (+ diff Embeds); never `unknown` unless an event kind drifts
```

```ts
// packages/web/src/components/SessionDialIn.tsx — the NEW web composition (one surface, prop-driven, story+page).
export interface SessionDialInProps {
  readonly header: { agentName: string; taskTitle: string; status: "live" | "ended"; statusLabel: string };
  readonly descriptor: HarnessCapabilityDescriptor;     // resolved from the session's agent harnessType
  readonly config: Record<string, string>;              // current option values keyed by option.key
  readonly onConfigure: (change: { key: string; value: string }) => void;  // emits; persistence is the page's call
  readonly parts: ReadonlyArray<Part>;                  // derivePartsFromSession(...) output
  readonly onOpen: OpenHandler;                         // diff embeds route to the Artifact view
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

## Ordered task list

1. **Lift `ActivityEntry` → shared as `SessionActivityEvent`** (`packages/shared/src/part.ts` or a sibling `session-activity.ts`; re-export from `index.ts`). Keep `useSessionActivity`'s union compatible (map `tool_call|reasoning|cost_tick` → adapter input; `cost_tick` excluded from Parts). Test: type round-trips; `cost_tick` produces no Part. **Files:** `packages/shared/src/part.ts`, `packages/shared/src/index.ts`. **Shared file.**
2. **Implement `derivePartsFromSession`** (replace the `[]` stub). Map events → `prose` Parts authored by `agent`; `edit`/diff → a `diff` Embed (`{route:"artifact", artifactId}`). Proves AC3+AC4. Test: `part.test.ts` — fixture entries → `Part[]`; cross-backend identical fixtures → identical Parts. **Files:** `packages/shared/src/part.ts`.
3. **Wire the `session` `OpenTarget`** — add `onOpenSession` to `OpenHandlerContext`; `case "session"` calls it (no navigation). Proves AC1 (entry, no flow promotion). Test: `open-handler.test.ts` — session target invokes the callback, never navigates. **Files:** `packages/web/src/services/open-handler.ts`. **Shared file.**
4. **Build `DialInControls`** (promote from the design fixture `sessionDialInFixtures.tsx` into a production component). Dispatch on `HarnessModelOptionControl.kind`: `select`→option pills, `boolean`→DS `Checkbox`, `number`/`text`→DS `Input`. Model row over `descriptor.models.filter(selectable)`. Undeclared option ⇒ absent. Proves AC2. Test: `DialInControls.test.tsx` (two descriptors: full options vs none). **Files:** `packages/web/src/components/DialInControls.tsx` + `.stories.tsx`.
5. **Resolve the descriptor for a session.** `harnessType` IS on the agent (users) schema (`packages/db/src/schema.ts:71`, nullable). Add the agent's `harnessType` to the `GET /sessions/:id/activity` response (it already returns `session.agentId`/`modelTier` — join the agent's `harnessType`). The dial-in resolves `harnessType` → descriptor from the `/api/harnesses` list (deduped by `type`). Add a small `useHarnessDescriptor(harnessType)` selector over the existing harnesses fetch. Null `harnessType` → fall back to the `builtin` descriptor (or render the model row only). Test: integration test on the activity route asserts `harnessType` in the response; unit test on the selector incl. the null fallback. **Files:** `packages/server/src/routes/sessions-routes.ts`, a web hook `useHarnessDescriptor.ts`. **Shared file (sessions-routes).**
6. **Build `SessionDialIn`** (the non-modal slide-over composition: header + `Fold` + `DialInControls` + `PartList`). Prop-driven, one surface for story + page (mirror `ConversationSurface`'s no-drift pattern). Carry `SessionActivityPanel`'s scroll-pause logic for the live state. Proves AC1/AC3 composition. Test: `SessionDialIn.test.tsx` — renders `PartList`, renders controls, close fires `onClose`, panel is NOT inside the conversation column. **Files:** `packages/web/src/components/SessionDialIn.tsx` + `.stories.tsx`.
7. **Wire into the conversation page** — `Conversations.tsx` holds `openSessionId` panel state; binds `createOpenHandler(navigate, { betId, onOpenSession: setOpenSessionId })`; renders `<SessionDialIn>` beside `<ConversationSurface>` when `openSessionId` set; feeds `useSessionActivity(openSessionId)` → `derivePartsFromSession`. Proves AC1 end-to-end. Test: E2E/component — open Fold → panel appears beside conversation; ✕ closes; focus restores. **Files:** `packages/web/src/pages/Conversations.tsx`.
8. **Supersede `SessionActivityPanel` in `Conversations.tsx`** — RECONCILED: `Conversations.tsx` already mounts `SessionActivityPanel` (the existing dial-in companion). AM3 replaces that mount with `SessionDialIn` (Task 7 IS this reroute). Then delete `SessionActivityPanel.tsx` + `.stories.tsx` + `SessionActivityPanel.test.tsx`, and update the 3 tests that import it (`AF10-money-surfaces.test.tsx`, `L17-money-web.test.tsx`, `EmptyState.compact.test.tsx`) to use the new surface or drop the SessionActivityPanel assertions. Verify: `grep -rn "SessionActivityPanel" packages/web/src` returns zero after. **Files:** `packages/web/src/components/SessionActivityPanel.{tsx,stories.tsx}`, `SessionActivityPanel.test.tsx`, the 3 importing tests.
9. **Re-bless web catalog snapshot** for the 3 design stories + new production stories (builder, green phase only). **Not the designer's job.**

## Migrations
- **`SessionActivityPanel` supersession (Task 8) — RECONCILED importers:**
  - `packages/web/src/pages/Conversations.tsx` — `reroute` to `SessionDialIn` (Task 7).
  - `packages/web/src/components/SessionActivityPanel.{tsx,stories.tsx}` — `delete`.
  - `packages/web/src/__tests__/SessionActivityPanel.test.tsx` — `delete`.
  - `packages/web/src/__tests__/AF10-money-surfaces.test.tsx`, `L17-money-web.test.tsx`, `EmptyState.compact.test.tsx` — `rename`/retarget: these import `SessionActivityPanel` for money/empty-state coverage; move those assertions to a surviving surface (the activity now renders cost in the dial-in header / `EmptyState` in the activity zone) or drop the panel-specific assertion. Enumerate done — no further grep needed at build start beyond the post-delete zero-check.
- **`ActivityEntry` → `SessionActivityEvent` lift (Task 1).** `useSessionActivity.ts` keeps its union for the hook's own API; the adapter input is the shared type. If they're unified, update the hook's import. List: `useSessionActivity.ts`, `SessionActivityPanel.tsx` (if kept), any test importing `ActivityEntry`.

## Route checklist
- `case "session"` in `createOpenHandler` (`open-handler.ts`) — the ONLY routing seam touched. No new URL route (entry is panel state, not navigation — deliberately, to avoid promoting the session to a first-class route per the rejected Variant B). Confirm no other `OpenTarget.route` handling changes.

## Security & abuse cases
- **Rate-limit on POST/PATCH:** N/A — AM3 is read-config + read-activity. The only write is `onConfigure` (Task 6/7); if it persists via an existing session/agent PATCH, that endpoint's existing limits apply. No NEW write endpoint in scope (recommend read-config-only or emit-to-existing-endpoint; see open question 3).
- **Input-trust boundary for agent-authored fields:** activity `summary`/`toolName`/diff `label` are agent-authored → render as React-escaped TEXT only (ReferenceChip already escapes; prose renders as text, never HTML). Assert no `dangerouslySetInnerHTML` in the activity path.
- **Secret-handling:** N/A — the descriptor is non-secret (the `/api/harnesses` `public-data` boundary already established); no credential surface in the dial-in.
- **Path-traversal / SSRF:** N/A — no path or outbound-URL input.
- **Descriptor over-trust:** the dial-in renders ONLY declared options; an undeclared option is absent (AC2) — a malformed descriptor can't inject a control kind outside `HarnessOptionControlKind` (the union is closed; unknown kind → render nothing, no throw).

## protectedTests
- `packages/web/src/components/__tests__/PartList.test.tsx` (if present) and the AM1 `part.test.ts` assertions for `derivePartsFromMessages` — AM3 must not change the conversation adapter's behavior, only fill the session adapter.
- The `no-restricted-imports` ESLint boundary config for `PartList.tsx`/`parts/**` — must stay (the AC3 reuse proof).

## sharedFiles
- `packages/shared/src/part.ts`, `packages/shared/src/index.ts` (adapter + type lift)
- `packages/web/src/services/open-handler.ts` (session case)
- `packages/server/src/routes/sessions-routes.ts` (harnessType in activity response)
- `packages/web/src/pages/Conversations.tsx` (panel wiring)

## Risks / ambiguities (open questions for the founder/reviewer — carried from approved.md)
1. **Config persistence scope** (`HarnessModelOptionDescriptor.scope` = launch|durable). Recommend: AM3 surfaces controls + emits `onConfigure`; persistence target (session-launch payload vs agent `modelTierPreference`/`reasoning`) is decided at wiring — default to NO new write endpoint this WP (emit to an existing one or read-only) to keep scope tight.
2. **`harnessType` in the activity response** vs a separate descriptor lookup — recommend adding it to the existing `GET /:id/activity` response (cheap, already returns agent context) over a new round-trip.
3. **`SessionActivityPanel` fate** — delete if unreferenced; the dial-in supersedes it. Confirm no page depends on it before deleting.
