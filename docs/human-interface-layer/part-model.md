# Conversation & the Part model (TRACK-AM AM1)

Ground truth for how a **Conversation** reads and the **Part model** it renders through. Source concept: `plans/AM1/concept.md`. This is a *rendering* layer over the [Thread primitive](./thread-primitive.md) — it adds no data shape and reshapes no Thread/Message/verdict contract.

> **Naming guard.** The rendering unit is a **Part**, never a "Block". The [Block content primitive](./block-primitive.md) (L2, derived from markdown) and the "blocked" task/thread state own the word "block"; the conversation rendering layer must avoid it. "Part" is the deliberate industry alternative (Vercel AI SDK `message.parts`; Anthropic's API uses "content block", which we do not).

## Conversation

**Definition.** A Conversation is the deliberate-messaging *reading* of a Thread — a chronological exchange of messages people and agents **choose** to send, rendered calmly and embedding-rich.

**Essential properties.** Threaded (one host); composed of deliberate Messages (`plain | review | questionnaire | verdict`); messages may embed what they refer to; single calm reading column with foldable units; humans and agents are equal participants.

**What it is not.**
- **Not a session work-log / transcript.** Session activity (tool calls, edits, diffs, reasoning) is never first-class conversation content. (This is the load-bearing Track-AM distinction; blurring it is building t3.)
- **Not a live runtime activity stream.** Messages are deliberate; auto-emitted `HarnessEvent`s are not messages.
- **Not a new primitive.** It renders *within* Thread/Message/verdict; it reshapes none of them.

**Authority.** Derived from the Message rows, which remain server-authoritative and event-bus-emitting (the Thread primitive's rules apply unchanged).

## The Part model

**Definition.** The shared rendering structure: a closed vocabulary of typed **Parts** + the calm reading-column layout + the **Embed** and **Fold** devices. It answers "how does a thing read in this product," and it is **derived, never stored**.

**Part.** One typed rendering unit. A Part is **source-agnostic**: a *Message* renders to a Part (the Conversation), and a *session activity event* (`HarnessEvent` / `CapturedToolCall`) renders to a Part (the session view). That agnosticism is the whole point — it is why the lower-level session view (AM3) reuses this structure instead of re-implementing it. Part kinds are closed (exhaustive discriminant + `unknown` fallback, like a Block's `unknown` kind).

**As built.** The Part vocabulary, the Embed/OpenTarget types, and both adapters live in `packages/shared/src/part.ts`; the renderer lives in `packages/web/src/components/PartList.tsx` (+ per-kind `parts/*`). Part kinds are the closed list `prose | review | resolved | questionnaire | unknown`. The render vocabulary is deliberately decoupled from the message-type vocabulary — a `plain` message maps to a `prose` Part, so a session event that reads as text is also a `prose` Part (this is what keeps the renderer source-agnostic).

**Embed.** A Part (or in-Part element) that renders a referenced thing inline — a compact card/chip, not a bare link. **Embedding model (closed set, as built):** `artifact` · `block` · `diff` · `session-reference` · `entity-ref` · `mention` · `unknown`. Each carries an `OpenTarget` descriptor (except `mention`, which renders inline, and `unknown`, which does not navigate). Embeds degrade safely when the source is gone — a referenced thing with no destination route (e.g. a `message` entity-ref, for which no permalink route exists) collapses to the non-navigating `unknown` Embed rather than throwing.

**Fold.** The collapse-to-summary device on a Part — a completed/long unit shows a one-line summary ("Worked for 17s") and re-expands. UI-local state; never persisted. The single most important calm-making device.

**Session reference.** The Embed that points at a Session without inlining its activity. It is how a Conversation gets the founder from a message to the work (the lower-level dial-in, AM3) while keeping the work-log out of the conversation.

## Contracts

- **Cardinality.** Conversation ↔ Thread is 1:1. Message → exactly one Part. Part → zero-or-more Embeds. Embed → exactly one referenced entity. Session reference → exactly one Session.
- **Closure.** Part kinds closed (concept-doc update to add): `prose | review | resolved | questionnaire | unknown`. Embed target kinds closed: `artifact | block | diff | session-reference | entity-ref | mention | unknown`.
- **Mutability.** Parts and Folds are derived, never stored — no `part` table/column; Fold state is UI-local. Message/Thread rows stay the sole source of truth.
- **Identity.** A Part's identity derives from its source (Message id, or session-event identity). No new opaque id minted.
- **Hard rules.**
  1. No "Block"/"blocked" in any Part-model name.
  2. The Part model is derived from Messages (and session events), never stored.
  3. Session activity never renders as first-class conversation Parts; a Session appears only as a Session-reference Embed.
  4. The Part model is source-agnostic and reusable — the session view (AM3) renders through it with no duplicated renderer (AM1↔AM3 uniformity).
  5. Thread / Message / verdict semantics unchanged.
  6. No color/token changes — Hearth palette + `AESTHETICS.md` tokens unchanged.

## Where it renders (as built)

The live Conversations surface (`packages/web/src/pages/Conversations.tsx`) renders **`ConversationSurface`** (header · author-grouped Part column · unified-"+" composer). It calls `derivePartsFromMessages(messages, viewerId, identities)` and feeds the result to **`PartList`** — the same source-agnostic renderer the design story and the AM3 session view consume. `ThreadShell` / `RichMessageCard` and the inline-verdict path are gone from this surface.

`PartList` is the AM1↔AM3 reuse seam. Two adapters in `part.ts` produce the same `Part[]`: `derivePartsFromMessages` (the Conversation) and `derivePartsFromSession` (a stub today, the seam AM3 fills in). The renderer imports `Part` only — never `Message` or any source type — and that import boundary is enforced by an ESLint `no-restricted-imports` rule scoped to `PartList.tsx` + `parts/**`, so AM3 adds its adapter without touching the renderer.

The everyday composer stays for deliberate messages (one unified "+" tools menu, draft reference chips, one Send). Session dial-in pills (model/effort/mode/permission) are the lower-level AM3 surface, not the conversation composer.

## Open / routing (the conversation owns no viewing surface)

The conversation's reference chips/embeds and the review/session affordances carry **`OpenTarget` descriptors** — typed routing intents, not navigate calls. `PartList` takes one `onOpen: OpenHandler` prop; the page binds it via `createOpenHandler(navigate, { betId })` (`packages/web/src/services/open-handler.ts`); the story binds it to `console.info`. The conversation owns no viewing surface — every affordance opens an existing destination view.

| `OpenTarget.route` | Opens | Resolved path |
|---|---|---|
| `host` | the entity's **host surface** (block/knowledge/bet/task/artifact/agent) | `resolveHostRoute(hostKind, hostId)` — total over `BlockHostKind`; `user` is a documented no-op |
| `artifact` | Artifact view | `/artifacts/:id` |
| `review` | the review page | `/work/bet/:betId/review/:reviewId` |
| `session` | the AM3 session dial-in | no route yet (no-op until AM3) |

A **block** reference is title-only and routes to its **host surface** (the common case is a knowledge item → `/knowledge/:id`); the heavy resolving `BlockRefEmbed` is not what the conversation renders. Block-anchored navigation ("jump to §2") is unmet by destinations today and is deferred to the standardized open/routing contract (AM5). AM1 wires the hooks; it does not build the destination views.
