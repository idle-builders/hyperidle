# Conversations View

Messaging surface. One single, shape-agnostic thread detail surface (L9/AM1) — the detail pane adapts to the messages in the selected thread; it is one surface, not two routes. Reviews are *read* here but *decided* on the ReviewPage (see [Reviews relocate](#reviews-are-not-decided-here)).

## Routes and page states

| Route | Behavior |
|---|---|
| `/conversations` | Queue — thread list, or empty state when no threads exist |
| `/conversations/:threadId` | Thread detail (states B–E) |
| `/conversations/review?id=` · `/conversations/chat?thread=` | Legacy redirects → canonical routes, `replace: true` (`router.tsx:58-72`) |

Exactly five page states A–E (`Conversations.tsx:24-25`). State E ("Thread not found") mounts no `ConversationSurface` — no message list, no composer.

Shell structure (Sidebar | Main), badges, and the N-shortcut → RecipientPicker flow are owned by [app-shell-always-present.md](app-shell-always-present.md).

## Thread list (queue)

`ThreadSections` (`layers/core-ui/src/components/ThreadSections.tsx`) renders the queue.

- **Live mode is flat** — the `/conversations` page mounts `groupBySection={false}` (`Conversations.tsx:717`): one chronological list sorted by `lastActiveAt` DESC. Filter chips were removed (AF14 AC4) — they never matched real state; the `blocking`/`unread` fields stay on `ThreadItem` for forward-compat (AF7).
- **Sectioned mode** (`groupBySection=true`, component default) groups into three sections — Blocking / Active / Resolved · 24h (`ThreadSections.tsx:101-108`). Classification ladder: resolved within 24h → Resolved; else blocking → Blocking; else Active (`ThreadSections.tsx:113-123`). Sorts: Active = pinned desc → hasUnresolvedReview desc → id asc (`ThreadSections.tsx:132-136`); Resolved = resolvedAt desc. Blocking gets a sticky header, danger tint, and a 3px left danger accent; Blocking and Resolved are silently absent when empty.
- **Filter vocabulary** `ConversationsFilter = all | blocking | async` (`ThreadSections.tsx:68`). `predicateFor` is the single filter predicate, shared between ThreadSections sectioning and the AppShell blocking-count badge so list and badge cannot drift. Filter state lives in AppShell and arrives via OutletContext (U6 AC-16).

Header: page title + "New thread" button (opens RecipientPicker via AppShell context). Empty queue renders a centered EmptyState with a "Start a thread" action. New threads appear in the list; updates arrive live over WebSocket.

## Thread detail — Part-based surface

The populated state renders `<ConversationSurface>`: thread header · author-grouped Part column (sender, avatar, timestamp) · unified-"+" composer at the bottom. The page derives `Part[]` via `derivePartsFromMessages` (the only Message-aware seam) and routes references through `createOpenHandler` (the OpenTarget → navigate seam) — see [../human-interface-layer/open-contract.md](../human-interface-layer/open-contract.md).

Part renderers (`layers/core-ui/src/components/parts/`):

| Part | Rendering |
|---|---|
| prose | Answer prose |
| reasoning | **Collapsed by default** to "Thought for Ns"; expands to quiet prose under a left rule (`ReasoningPart.tsx`) |
| tool | Tool call row |
| questionnaire | Questionnaire |
| review-request | Unresolved review — "Open review" link only |
| review-resolved | Resolved-review echo |
| unknown | Fallback |

Part-model depth (kinds, derivation, contracts) is owned by [../human-interface-layer/part-model.md](../human-interface-layer/part-model.md).

## Reviews are NOT decided here

AM1 relocated the decision UI: the conversation no longer takes a verdict — no verdict POST is reachable from this surface. An unresolved review renders as a `review` Part with a single "Open review" hook → the ReviewPage at `/reviews/:reviewId` (`router.tsx:94`); a resolved review echoes back as a `resolved` Part (`Conversations.tsx:16-22`). Verdict semantics (Message type, payload, decision set) are unchanged — only the UI moved; they are owned by [../human-interface-layer/thread-primitive.md](../human-interface-layer/thread-primitive.md).

`ArtifactRef` is deleted along with the row it pointed at — a produced item is a knowledge item and is referenced as one. An artifact has no stored kind: its content is a markdown body and its kind is derived from that body's blocks at render time; see [../process-layer/artifact-primitive.md](../process-layer/artifact-primitive.md). Still distinct from the 9 AL2 review canvas kinds (`layers/core-ui/src/pages/review/canvas-registry.ts:21-29`: `outcome_summary`, `field_change_set`, `action_operation`, `rendered_in_context`, `metrics_moved`, `visual_diff`, `code_diff`, `batch`, `browser_preview`; unknown input falls back to `ReviewUnknownCanvas`).

## Session dial-in

A task-hosted thread with an active session shows a "Dial In" button (secondary style, pulsing live dot). Pressing **D** (outside text inputs) toggles dial-in against the thread's single active session — there is no session picker (`Conversations.tsx:313-315`).

Dialed in, the page renders a companion split: `ConversationSurface` on the left, `SessionActivityPanel` on the right.

`SessionActivityPanel` (`layers/core-ui/src/components/SessionActivityPanel.tsx`):

- Read-only activity stream — tool calls, reasoning excerpts, cost ticks; no input affordances; `aside` landmark.
- Filter tabs: **All | Tools | Reasoning | Cost**.
- States: streaming (live entries), ended (summary), error (retry). Auto-scroll pauses when the user scrolls up, resumes at the bottom.
- Closes via its close button or **D** again — no Escape binding.

## Companion split layouts

Two splits exist, both on `SplitView` with per-surface ratio persistence (AM5 T6):

| Trigger | Surface key | Right pane |
|---|---|---|
| Dial-in (D / button) | `conversation.dial-in` | `SessionActivityPanel` (`Conversations.tsx:461`) |
| Opened session-reference embed (AM3) | `conversation.session` | Session view (`Conversations.tsx:496`) |

The page owns placement; a `fold-back` mode change closes the split.
