# AM3 — Session View — Architecture (build plan, founder-approved design)

**Reconciled to the founder-approved design (2026-06-22, 12 review rounds).** Supersedes the attempt-1 plan (a non-modal "dial-in" slide-over with a config band + prose-only adapter + a separate `SessionDialIn` surface). The approved design is a **streaming human+agent conversation rendered through the SHARED `PartList` / `ConversationSurface`** — a session is a slightly different FORM of conversation. No parallel renderer, no dial-in panel.

Input contracts (fixed, not re-litigated):
- `plans/AM3/design/approved.md` — the locked design (the unified self/other message pattern, the full session aspect list, the aggregation rule, cost-in-header, sub-agent recursion, the AM1-conversation-parity note).
- `plans/AM3/concept.md` — LOCKED. The `tool`+`reasoning` `PartKind` extension, the streaming/queue/diff-reuse/aggregation contracts.
- AM1 Part model — `packages/shared/src/part.ts`, `docs/human-interface-layer/part-model.md`. The session renders through `PartList` + `derivePartsFromSession`; NO duplicated renderer (hard-rule 4).
- AM2 capability descriptor — `packages/shared/src/harness/harness-capability-descriptor.ts`. Composer pills render declaratively; no per-backend branching.

## Required reading (engineer reads before implementing)
- `packages/shared/src/part.ts` — the `Part`/`Embed`/`OpenTarget` vocabulary + the closed `PartKind` union + `derivePartsFromSession()` stub (the seam this WP fills).
- `docs/human-interface-layer/part-model.md` — hard-rules 1–6, the AM1↔AM3 reuse boundary; the `PartKind` closure list to extend.
- `packages/web/src/components/PartList.tsx` + `parts/*` + `parts/embeds.tsx` — the SHARED renderer this WP extends (the self/other message pattern + avatars + embed-row live here; both surfaces inherit it).
- `packages/web/src/components/ConversationSurface.tsx` — the surface shape the session reuses (header + `PartList` column + composer).
- `packages/shared/src/harness/harness-capability-descriptor.ts` — `HarnessCapabilityDescriptor`, `HarnessModelDescriptor`, `HarnessModelOptionDescriptor`, `HarnessModelOptionControl`.
- `packages/web/src/hooks/useSessionActivity.ts` — the NORMALIZED `ActivityEntry` union + statuses (the adapter's source).
- `packages/web/src/services/open-handler.ts` — the `session` `OpenTarget` no-op (the entry hook; also the sub-agent recursion seam).
- `packages/web/src/pages/review/ReviewCodeDiff.tsx` — the ONE diff renderer the session reuses (rejection 5).
- `plans/AM3/design/approved.md` + `packages/web/src/components/SessionView.stories.tsx` + `sessionContentFixtures.tsx` — the approved embodiment (the build target).

## Plan reconciliation (spec ⇆ reality)

| Spec assumption (approved design) | Reality | Plan handling |
|---|---|---|
| Session renders through the SHARED `PartList`, self/other pattern | `PartList` is the source-agnostic renderer; `derivePartsFromSession()` is a stub returning `[]`. The unified self/other pattern (my own = right grey box; everyone else incl. agents = left-plain) + avatars + split embed-row must be ADDED to the shared `PartList` (story fixture is byte-for-byte the target). | Grow `derivePartsFromSession` into the real adapter; fix the message pattern + avatars + embed-row in the SHARED `PartList` (this also fixes the AM1 conversation). Render the session through it unchanged after that. |
| `tool` + `reasoning` are new render kinds | The closed `PartKind` is `prose | review | resolved | questionnaire | unknown` — no `tool`/`reasoning`. | Extend the CLOSED union with `tool` + `reasoning` (exhaustive dispatch + `unknown` fallback preserved; `assertNeverPart` still compiles). Two new `parts/*` renderers. |
| Tool aggregation | No grouping exists for a tool run. | A renderer grouping beside `groupParts` (NOT a Part kind) — the final aggregation rule (below). |
| File diffs reuse `ReviewCodeDiff` | `ReviewCodeDiff` exists; the `diff` Embed kind exists (`part.ts`). | A file-change `tool` Part carries a `diff` Embed → opens/inlines `ReviewCodeDiff`. No new diff renderer. |
| Composer pills from the descriptor | `/api/harnesses` returns `HarnessCapabilityDescriptor[]`; `HarnessModelOptionDescriptor.control` carries the kind. | Pills dispatch on `control.kind`; a model declaring no option → no pill. No per-backend branch. |
| Queued human message | No queue state exists. | Pre-Part composer/session state, FIFO, cancellable, non-interrupting; delivers into a `prose` Part at the next turn boundary. |
| Sub-agent opens its own nested session | The `session` `OpenTarget` `case "session"` is a documented no-op. | A sub-agent `tool` row carries a `session` `OpenTarget`; the same open seam opens the sub-agent's session view recursively. |
| Entry/placement | The `session-reference` Embed renders + fires `onOpen({route:"session", sessionId})`. | **SETTLED — not a design axis.** Reuse the `session` `OpenTarget` + the `ConversationSurface` surface. No route/panel/split exploration (that was the wrong axis, dropped). |
| Permission / approval prompt | — | **NOT built.** HyperIdle has no per-tool allow/deny gate; the review is the allow point. No `permission` Part kind, no `PermissionPrompt`. |
| Status-metrics roll-up bar | — | **NOT built.** Header carries minimal session identity + the **session-total cost** (`$0.71 · 48.2k tokens`, plain "$"). |

No spec/doc contradiction found. No `/concept` gap.

## The approved build, item by item

### (a) Extend `PartKind` with `tool` + `reasoning` (closed, exhaustive, unknown-fallback)
Add `tool` and `reasoning` to the closed `PartKind` union in `packages/shared/src/part.ts`. The union stays `prose | review | resolved | questionnaire | tool | reasoning | unknown`. New members (shape from concept Phase 4):

```ts
| (BasePart & { kind: "tool";
      verb: string;                                   // "Run command" | "Read" | "Edit" | "Web search" | …
      target?: string;                                // muted truncated preview (command/path/# comment)
      toolKind: ToolKind;                             // closed family → icon/verb; unknown-tolerant
      status: "running" | "ok" | "failed" | "neutral";
      output?: string;                                // collapsed mono body; absent until expanded
      opensSession?: { sessionId: string; label: string };  // sub-agent recursion (j)
      // embeds may carry a `diff` Embed for a file-change tool call
  })
| (BasePart & { kind: "reasoning";
      durationMs: number;                             // → "Thought for Ns" resting label
      text: string;                                   // quiet body, shown on expand
  })
```

`ToolKind` is a CLOSED family set (`command | file-read | file-change | web-search | search | mcp | sub-agent | create | …`) with a **generic fallback** — an unrecognized family renders a generic tool row, never throws (mirrors the `unknown` Part discipline). `PartList`'s switch gains `case "tool"` + `case "reasoning"`; `assertNeverPart` keeps compile-time exhaustiveness + a non-throwing runtime `UnknownPart`. Two new renderers in `packages/web/src/components/parts/` (web layer, like the existing per-kind renderers).

### (b) `derivePartsFromSession` over normalized `ActivityEntry`
Grow the `[]` stub into the real adapter. Source = the NORMALIZED, backend-agnostic `ActivityEntry` union (consumed DIRECTLY — no parallel type). The adapter maps activity → Parts:
- `tool_call` → a `tool` Part (verb/target/toolKind/status/output derived per family; a file-change carries a `diff` Embed).
- `reasoning` → a `reasoning` Part (`durationMs` + `text`).
- cost → SKIPPED as a Part (cost is header chrome — the session-total, see g).
- a streaming agent answer → a `prose` Part whose text grows (append; streaming caret on the in-progress turn).
- a delivered human message → a `prose` Part authored by the human (the self/other pattern handles alignment).

The adapter is the only new source logic; the renderer is shared. `ActivityEntry` is lifted into `packages/shared` so the adapter (shared) + the hook (web) + the buffer (server) reference ONE definition. The signature takes `ActivityEntry[]` only — NO harness-type parameter (compile-time proof the renderer can't branch on backend → uniformity by construction; backend→`ActivityEntry` normalization is AM2's upstream contract, out of AM3 scope).

### (c) Tool-run aggregation grouping (final rule)
A renderer grouping beside `groupParts` (NOT a Part kind). **THE AGGREGATION RULE (final):**
- Within an agent turn, **ALL COMPLETED tool calls fold into the turn's aggregate expander — INCLUDING failed ones**. The aggregate header **signals failures** when present ("Edited 2 files, ran 2 commands · 1 failed" + a small ✗/`--status-error` marker); on expand the failed step shows its ✗ + stderr beneath a left rule.
- **The ONLY tool that renders STANDALONE is the currently-RUNNING one** (live/streaming — e.g. the running sub-agent). Once it completes it folds in too.
- **Diffs are never lost:** the per-turn **Changed files (N)** panel always surfaces the turn's file changes regardless of folding.
- `aggregateAt = 2` (calm bias); collapsed at rest.

### (d) Diff reuse via `ReviewCodeDiff`
A file-change `tool` Part carries a `diff` Embed (`part.ts` `diff` kind: `label/meta/target`). The Embed's `OpenTarget` opens/inlines `ReviewCodeDiff` — `meta` carries the `+N/−N` stat for the chip; `target` routes to the diff surface. A per-turn/session **Changed files (N)** panel below the stream also opens `ReviewCodeDiff`. **Hard rule:** one diff renderer in the product — no new per-file diff component.

### (e) Composer pills from `HarnessCapabilityDescriptor`
Reuse the `ConversationSurface` composer chrome (its exact container + "+" attach affordance). ADD a compact left pill strip rendered from the descriptor: `select`→pill, `boolean`→toggle, `number`/`text`→input — **never per-backend-branched**. A model declaring no effort option → no effort pill. The pills are launch settings, not an inline gate. Composer state: idle → Send; streaming → Stop + "Working for Ns" + Send-which-queues.

### (f) Queued message — pre-Part state
A queued human message is pre-Part composer/session state, FIFO, cancellable, **non-interrupting** (starts the NEXT turn, never preempts the running one). It renders following the unified self/right-aligned pattern, muted + clock + "sends when the agent finishes" + dequeue ✕. On consumption it converts to a normal human-authored `prose` Part.

### (g) Render the session through the SHARED `PartList` (the self/other pattern — no parallel renderer)
The session view IS a `ConversationSurface`-shaped reading fed the SAME `Part[]` through `derivePartsFromSession`. The **unified message pattern is fixed at the source in the shared `PartList`**:
- Only MY OWN (`isMe`) messages → right-aligned grey box (`bg-[var(--surface-container)]`, `rounded-[var(--r-default)]`, capped ≤80%), avatar+name header above the box's top-left corner.
- Everyone else (other humans AND agents) → left-aligned, plain, no background.
- Round avatars: GREEN=agent / GREY=human (`GroupAvatar`); no agent star glyph.
- `session-reference` split from attachments onto its own `EmbedRow` level.

No parallel/second renderer. The header carries minimal session identity + the **session-total cost** (`$0.71 · 48.2k tokens`, plain "$", no glyph — via `formatMoney`/`ArtifactCostChip` look). Sub-agent recursion (j): a sub-agent `tool` row's `opensSession` fires the `session` `OpenTarget` → the same surface, recursed.

### (h) Re-bless DOM snapshots + update `PartList` tests
The shared `PartList` (and therefore `ConversationSurface` + the catalog) changed: the avatar/self-box/embed-row structure is new. **Builder (green phase):**
- Re-bless the PartList / ConversationSurface / catalog DOM snapshots (`npm run test` → read the diff → `npm run ds:bless`; never blind `-u`).
- Update `PartList` tests for the new avatar / self-box / split-embed-row structure.
- **The same shared change fixes the AM1 conversation** (it was missing avatars + the self-box) — its snapshots move in the same re-bless; confirm the conversation diff matches the intended self/other pattern, not a regression.

## Type signatures / contracts

```ts
// packages/shared/src/part.ts — extend the closed PartKind union (a) + grow the adapter (b).
export const PART_KINDS = ["prose","review","resolved","questionnaire","tool","reasoning","unknown"] as const;

export function derivePartsFromSession(
  entries: ReadonlyArray<ActivityEntry>,   // NORMALIZED, backend-agnostic — consumed directly
  agent: PartAuthor,                       // the session's agent
): Part[];
// tool_call → tool Part (+ diff Embed for a file-change); reasoning → reasoning Part;
// streaming answer → prose Part (grows); delivered human msg → prose Part (self pattern handles alignment);
// cost → SKIPPED (header chrome). Exhaustive over ActivityEntry["type"] (exhaustiveAssert on default).
```

```ts
// packages/web/src/services/open-handler.ts — the session case (entry + sub-agent recursion).
// case "session": ctx?.onOpenSession?.(target.sessionId); return;   (no navigation; recurses)
```

## Ordered task list
1. **Lift `ActivityEntry` (UNCHANGED shape) → `packages/shared/src/session-activity.ts`** (re-export from `index.ts`); re-point the two verbatim-duplicate copies' imports (web hook + server buffer). True lift, no remap.
2. **Extend the closed `PartKind` union with `tool` + `reasoning`** (`part.ts`) + the closed `ToolKind` family set with a generic fallback. Preserve exhaustive dispatch + `unknown` fallback (`assertNeverPart`).
3. **Implement `derivePartsFromSession(entries, agent)`** (b) — `tool_call`→`tool` Part (+ `diff` Embed for file-change), `reasoning`→`reasoning` Part, cost→skipped, streaming answer→`prose`, human→`prose`. Exhaustive over the union.
4. **Add the two `parts/*` renderers** (`tool`, `reasoning`) + extend `PartList`'s dispatch (`case "tool"`, `case "reasoning"`).
5. **Fix the SHARED `PartList` message pattern** (g) — the unified self/other rule (my own = right grey box; everyone else incl. agents = left-plain), round tinted `GroupAvatar` (green=agent/grey=human, no star), `session-reference` split onto its own `EmbedRow` level. This ALSO fixes the AM1 conversation.
6. **Add the tool aggregation grouping** beside `groupParts` (c) — the final rule (all completed fold incl. failed; aggregate header signals failures; only the running tool standalone; diffs never lost via the Changed files panel).
7. **Wire diff reuse** (d) — a file-change `tool` Part's `diff` Embed + the per-turn Changed files panel both open `ReviewCodeDiff`. No new diff renderer.
8. **Build the descriptor composer pill strip** (e) — dispatch on `control.kind`; undeclared option ⇒ absent; no harness-type branch. Composer working/queue/Stop state.
9. **Build the queued-message pre-Part state** (f) — FIFO, cancellable, non-interrupting; delivers to a `prose` Part.
10. **Wire the `session` `OpenTarget`** (open-handler) — entry from a `session-reference` + sub-agent recursion (j). No new route.
11. **Compose the session view** through the shared `PartList` / `ConversationSurface` (g) — header (identity + session-total cost via `formatMoney`) + the stream + the composer.
12. **Re-bless DOM snapshots + update `PartList` tests** (h) — PartList / ConversationSurface / catalog; confirm the AM1 conversation diff matches the intended pattern. **Builder, green phase.**

## Hard rules carried into architecture
- One message renderer: the shared `PartList` over `derivePartsFromSession`; the self/other pattern is fixed at the source — NO parallel renderer.
- One diff renderer: reuse `ReviewCodeDiff`.
- One composer: reuse the `ConversationSurface` composer chrome.
- `PartKind` stays closed + exhaustive + `unknown`-terminated; `tool`/`reasoning` is the only union growth (concept-doc-gated).
- No color/token change (only `failed` uses the existing destructive token).
- Parts derived-never-stored; queued message is pre-Part state, FIFO, non-interrupting.
- No inline permission gate; no status-metrics roll-up bar.
- The AM1 conversation is fixed by the SAME shared `PartList` change — its snapshots/tests move with it.

## Security & abuse cases
- **No new write route.** Composer pills mutate page-held state; the only server touch is the read activity endpoint. No rate-limit surface (no AM3 write).
- **Agent-authored fields** (`verb`/`target`/`output`/`text`) render as React-escaped TEXT only — no `dangerouslySetInnerHTML` in the activity path.
- **Descriptor over-trust:** the composer renders ONLY declared options; an unknown control kind renders nothing (closed union), never throws.
- **No path/SSRF/secret surface** in the session view.

## protectedTests
- `packages/shared/src/__tests__/AM1-part.test.ts` — the frozen `derivePartsFromMessages` contract; AM3 fills the SESSION adapter only.
- `packages/shared/src/__tests__/AM1-source-agnostic.test.ts` — the source-agnostic import boundary (AC3 reuse proof).
- The `no-restricted-imports` ESLint boundary on `PartList.tsx`/`parts/**` — stays (the static half of the reuse proof).

> **Note on the AM1 conversation:** AM3's shared-`PartList` change updates the conversation's avatar/self-box rendering too (it was missing both). PartList tests + the conversation's DOM snapshots are updated in the same change — this is intended parity, not a regression.
