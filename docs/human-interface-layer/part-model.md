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

**Embed.** A Part (or in-Part element) that renders a referenced thing inline — a compact card/chip, not a bare link. **Embedding model (closed):** `artifact` (`ArtifactEmbed`), `block` (`BlockRefEmbed`), `diff` (compact `+N/−M` card; fuller detail opens elsewhere, never as a wall), `session-reference`, plus inline `entity-ref` / `mention` (`EntityRef`, `MentionRef`). Embeds degrade safely when the source is gone.

**Fold.** The collapse-to-summary device on a Part — a completed/long unit shows a one-line summary ("Worked for 17s") and re-expands. UI-local state; never persisted. The single most important calm-making device.

**Session reference.** The Embed that points at a Session without inlining its activity. It is how a Conversation gets the founder from a message to the work (the lower-level dial-in, AM3) while keeping the work-log out of the conversation.

## Contracts

- **Cardinality.** Conversation ↔ Thread is 1:1. Message → exactly one Part. Part → zero-or-more Embeds. Embed → exactly one referenced entity. Session reference → exactly one Session.
- **Closure.** Part kinds closed (concept-doc update to add). Embed target kinds closed: `artifact | block | diff | session-reference | entity-ref | mention`.
- **Mutability.** Parts and Folds are derived, never stored — no `part` table/column; Fold state is UI-local. Message/Thread rows stay the sole source of truth.
- **Identity.** A Part's identity derives from its source (Message id, or session-event identity). No new opaque id minted.
- **Hard rules.**
  1. No "Block"/"blocked" in any Part-model name.
  2. The Part model is derived from Messages (and session events), never stored.
  3. Session activity never renders as first-class conversation Parts; a Session appears only as a Session-reference Embed.
  4. The Part model is source-agnostic and reusable — the session view (AM3) renders through it with no duplicated renderer (AM1↔AM3 uniformity).
  5. Thread / Message / verdict semantics unchanged.
  6. No color/token changes — Hearth palette + `AESTHETICS.md` tokens unchanged.

## Where it renders

The Conversations surface (`docs/information-architecture/conversations-view.md`); existing surface today is `ThreadShell` → `RichMessageCard` / `CommentRow` / `Composer` with `BlockRefEmbed` / `ArtifactEmbed`. AM1 factors these into the Part model; AM3's session dial-in reuses it. The everyday composer stays for deliberate messages (with embedding affordances) — session dial-in pills (model/effort/mode/permission) are the lower-level AM3 surface, not the conversation composer.
