# Conversation & Session View — the Part model

Ground truth for how a **Conversation** and a **Session view** read, and the **Part model** both render through. AM1 introduced the Part vocabulary over `Thread` messages; AM3 extended it with `tool` + `reasoning` Part kinds and the `derivePartsFromSession` adapter, making the Part model the single shared renderer for both surfaces.

> **Naming guard.** The rendering unit is a **Part**, never a "Block". The [Block content primitive](./block-primitive.md) (derived from markdown) and the "blocked" task/thread state own the word "block"; the conversation rendering layer must avoid it. "Part" is the deliberate industry alternative (Vercel AI SDK `message.parts`; Anthropic's API uses "content block", which we do not).

## Conversation

**Definition.** A Conversation is the deliberate-messaging *reading* of a Thread — a chronological exchange of messages people and agents **choose** to send, rendered calmly and embedding-rich.

**Essential properties.** Threaded (one host); composed of deliberate Messages (`plain | review | questionnaire | verdict`); messages may embed what they refer to; single calm reading column with foldable units; humans and agents are equal participants.

**What it is not.**
- **Not a session work-log / transcript.** Session activity (tool calls, edits, diffs, reasoning) is never first-class conversation content. (This is the load-bearing Track-AM distinction; blurring it is building t3.)
- **Not a live runtime activity stream.** Messages are deliberate; auto-emitted `HarnessEvent`s are not messages.
- **Not a new primitive.** It renders *within* Thread/Message/verdict; it reshapes none of them.

**Authority.** Derived from the Message rows, which remain server-authoritative and event-bus-emitting — the [Thread primitive](./thread-primitive.md)'s rules apply unchanged.

## Session View (AM3)

**Definition.** The Session view is the *reading* of a process-layer Session — a streaming, append-only human+agent conversation read through the SAME `PartList` renderer as a Conversation. A session is a slightly different FORM of conversation: same surface shape (header → reading column → composer), different content (streaming text + `tool` Parts + `reasoning` Parts + file diffs, interleaved in source order).

**What it is not.**
- **Not a controls form with an activity log.** The dominant element is the streaming agent prose, not a config band.
- **Not a parallel renderer.** No second/forked renderer exists — both surfaces go through the shared `PartList` over their respective adapters.
- **Not a deliberate-conversation work-log promoted into the Thread.** Session activity stays in the session view; a Conversation links to a session only via a `session-reference` Embed.

**Entry.** A `session-reference` Embed in a Conversation fires `onOpen({ route: "session", sessionId })` → `open-handler.ts case "session"` → `onOpenSession` → a split right-panel `SessionViewPanel`. Sub-agent tool rows carry their own `session` `OpenTarget` — clicking them recursively opens the sub-agent's session view through the same seam.

**Unified message pattern (shared `PartList` — inherited by both surfaces).**
- Only MY OWN messages (`isMe`) are highlighted: right-aligned, grey background box (`bg-[var(--surface-container)]`, `rounded-[var(--r-default)]`), capped at ≤80% width, with the avatar+name header above the box's top-left corner.
- Everyone else — other humans AND agents — renders left-aligned, plain, no background.
- Round avatars on every author: **GREEN** for agent, **GREY** for human. No agent "star" glyph.
- A `session-reference` Embed renders on its own `EmbedRow` level, separate from artifact/diff/block chips.
- This pattern is identical in the Conversation and the Session view — AM3 fixed it at the source in the shared `PartList`, which also corrected the AM1 conversation (which was missing avatars and the self-box).

## The Part model

**Definition.** The shared rendering structure: a closed vocabulary of typed **Parts** + the calm reading-column layout + the **Embed** and **Fold** devices. It answers "how does a thing read in this product," and it is **derived, never stored**.

**Part.** One typed rendering unit. A Part is **source-agnostic**: a *Message* renders to a Part (the Conversation), and a *session activity event* renders to a Part (the Session view). That agnosticism is the whole point — the session view reuses this structure instead of re-implementing it. Part kinds are closed (exhaustive discriminant + `unknown` fallback, like a Block's `unknown` kind).

**As built.** The Part vocabulary, the Embed/OpenTarget types, and both adapters live in `framework/conversation-parts/src/part.ts`; the renderer lives in `layers/core-ui/src/components/PartList.tsx` (+ per-kind `parts/*`). Part kinds form the closed list `prose | review | resolved | questionnaire | tool | reasoning | unknown`. The render vocabulary is deliberately decoupled from the message-type vocabulary — a `plain` message maps to a `prose` Part, so a session event that reads as text is also a `prose` Part (this is what keeps the renderer source-agnostic).

**`tool` Part (AM3).** One tool call the agent made. A compact row, not prose. Carries: `verb` (action label), `target` (muted truncated preview), `toolKind` (closed family set with a `generic` fallback), `status` (`running | ok | failed | neutral`), `output` (collapsed mono body, absent until expanded), and `opensSession` (for sub-agent recursion). Only `failed` uses the destructive color token (`--status-error`). A file-change tool call carries a `diff` Embed so file diffs are reachable even when the tool row is folded.

**`reasoning` Part (AM3).** A span of agent thinking. Collapsed by default to "Thought for Ns" (italic, tertiary color). Re-expands to muted prose under a left rule. No status glyph — reasoning is never success/failure. Carries `durationMs` (for the resting label) and `text` (the full reasoning body).

**`ToolKind` family.** The closed set `command | file-read | read | file-change | edit | search | web-search | mcp | sub-agent | create | generic`. An unrecognized family normalizes to `generic` — never throws (mirrors the `unknown` Part discipline).

**Embed.** A Part (or in-Part element) that renders a referenced thing inline — a compact card/chip, not a bare link. **Embedding model (closed set, as built):** `artifact` · `block` · `diff` · `session-reference` · `entity-ref` · `mention` · `unknown`. Each carries an `OpenTarget` descriptor (except `mention`, which renders inline, and `unknown`, which does not navigate). Embeds degrade safely when the source is gone — a referenced thing with no destination route (e.g. a `message` entity-ref, for which no permalink route exists) collapses to the non-navigating `unknown` Embed rather than throwing.

**Fold.** The collapse-to-summary device on a Part — a completed/long unit shows a one-line summary ("Worked for 17s") and re-expands. UI-local state; never persisted. The single most important calm-making device.

**Session reference.** The Embed that points at a Session without inlining its activity. It is how a Conversation gets the founder from a message to the work (the lower-level dial-in, AM3) while keeping the work-log out of the conversation.

## Tool-run aggregation (AM3)

Within an agent turn, completed tool calls fold into a single aggregate expander. **The aggregation rule (final):**

- **ALL COMPLETED tool calls fold into the turn's aggregate — including failed ones.** The aggregate header signals failures ("Edited 2 files, ran 2 commands · 1 failed" + a ✗/`--status-error` marker); expanding reveals the failed step's ✗ + stderr beneath a left rule.
- **The ONLY tool that renders standalone is the currently-RUNNING one.** Once it completes, it folds into the aggregate.
- **Diffs are never lost to folding.** A per-turn "Changed files (N)" panel always surfaces the turn's file changes, opening `ReviewCodeDiff` regardless of folding.
- `aggregateAt = 2` (calm bias — two consecutive completed calls already fold). Collapsed at rest.

Aggregation is a **renderer grouping beside `groupParts`**, not a Part kind. The `ToolRunBlock` type (`single | tool-run`) is exported from `part.ts` as the grouping shape; `aggregateToolRun(toolParts, aggregateAt)` is the pure grouping function.

## Model options are agent configuration

The options a model runs with are set once, when someone configures the agent, and apply to every run
of that agent. Nobody sets them per message.

They derive declaratively from the [`HarnessCapabilityDescriptor`](../agent-layer/harness-capability-descriptor.md):
the agent editor renders whatever the selected model declares, in whichever control kind it declares
(`select | boolean | number | text`). An undeclared option is absent — no per-backend branching, no
throws. A model that declares nothing renders nothing at all, which is most models on most harnesses.

A harness's own default is **shown but never stored**. A control sitting at its default contributes no
stored value, so an absent option means "whatever the harness does" rather than "unset" — which is what
keeps an agent nobody configured running exactly as it did before, and stops an agent being pinned to
whatever the default happened to be the day someone opened the editor.

> The Session view composer once rendered these as per-message pills, via a `deriveComposerPills`
> helper. That path never shipped anything: no harness ever declared an option, so the pill row
> filtered a permanently empty list and never appeared. The helper has been deleted.

## Contracts

- **Cardinality.** Conversation ↔ Thread is 1:1. Message → exactly one Part. Session → zero-or-more Parts via `derivePartsFromSession`. Part → zero-or-more Embeds. Embed → exactly one referenced entity. Session reference → exactly one Session.
- **Closure.** Part kinds closed: `prose | review | resolved | questionnaire | tool | reasoning | unknown`. Adding a kind requires a concept-doc update first. Embed target kinds closed: `artifact | block | diff | session-reference | entity-ref | mention | unknown`. `ToolKind` closed with `generic` fallback.
- **Mutability.** Parts and Folds are derived, never stored — no `part` table/column; Fold state is UI-local. Message/Thread rows stay the sole source of truth. Session `tool` Part status transitions (`running → ok/failed/neutral`) are derived updates from new activity entries, never stored mutations.
- **Identity.** A Part's identity derives from its source (Message id, or session-event timestamp). No new opaque id minted.
- **Hard rules.**
  1. No "Block"/"blocked" in any Part-model name.
  2. The Part model is derived from Messages (and session events), never stored.
  3. Session activity never renders as first-class conversation Parts; a Session appears in a Conversation only as a `session-reference` Embed.
  4. The Part model is source-agnostic and reusable — the Session view (AM3) renders through it with no duplicated renderer (AM1↔AM3 uniformity).
  5. Thread / Message / verdict semantics unchanged.
  6. No color/token changes — Hearth palette + design-system tokens (`framework/design-system/DESIGN.md`, `tokens.css`) unchanged. Only `failed` uses the existing destructive token.
  7. One diff renderer: `ReviewCodeDiff`. No new per-file diff component in the session view.

## Where it renders (as built)

**Conversation.** `layers/core-ui/src/pages/Conversations.tsx` renders **`ConversationSurface`** (header · author-grouped Part column · unified-"+" composer). It calls `derivePartsFromMessages(messages, viewerId, identities)` and feeds the result to **`PartList`**.

**Session view.** A `session-reference` Embed fires `onOpen({ route: "session", sessionId })`, which `open-handler.ts` resolves into `onOpenSession` → `SessionViewPanel` rendered in a split right panel. The session view calls `derivePartsFromSession(entries, agent)` and feeds the result to the same **`PartList`** renderer. New Part kinds handled in `PartList`'s exhaustive dispatch: `case "tool"` → `ToolPart`; `case "reasoning"` → `ReasoningPart`. `ActivityEntry` — the normalized, backend-agnostic union — is defined in `framework/domain-model/src/session-activity.ts` and published from that package's barrel.

`PartList` is the AM1↔AM3 reuse seam. Two adapters in `part.ts` produce the same `Part[]`: `derivePartsFromMessages` (the Conversation) and `derivePartsFromSession` (the Session view, AM3). The renderer imports `Part` only — never `Message` or `ActivityEntry` — and that import boundary is enforced by an ESLint `no-restricted-imports` rule scoped to `PartList.tsx` + `parts/**`.

The everyday Conversation composer is for deliberate messages (one unified "+" tools menu, one Send). The Session view composer adds a descriptor pill strip (model · effort · mode, from `HarnessCapabilityDescriptor`) and `working/queue/Stop` state — same chrome, session-specific additions only.

## Open / routing (neither surface owns a viewing destination)

Reference chips, embeds, and affordances carry **`OpenTarget` descriptors** — typed routing intents, not navigate calls. `PartList` takes one `onOpen: OpenHandler` prop; the page binds it via `createOpenHandler(navigate, { betId })` (`layers/core-ui/src/services/open-handler.ts`); the story binds it to `console.info`. Neither surface owns a viewing destination — every affordance opens an existing destination. The full route closure (`host | artifact | review | session`, which targets are no-ops, block-anchored opens) is owned by [open-contract.md](./open-contract.md). Sub-agent tool rows carry a `session` `OpenTarget` — clicking them recursively opens the sub-agent's Session view through the same seam.
