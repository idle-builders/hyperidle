# AM1 — Conversation Experience: Concept

**Level:** per-workpackage. Inherits the Track AM frame (conversation ≠ session) as a fixed input.
**Status:** locked (autonomous mode — `PIPELINE_INTERACTIVE` unset, no recap gate).
**Mode note:** `/concept` does not design or architect. This locks *what the things are*; `/design` and `/architecture` explore inside the lock.

---

## Required reading (downstream agents — `/design`, `/architecture`, `/pipeline`)

1. `.pipeline/work-packages/TRACK-AM.md` — AM1 spec, scope rules, the load-bearing distinction, design axes.
2. `plans/chat-redesign/t3code-reference.md` — the *style* to adopt (not the model). §2 rendering devices, §6 take-vs-reject.
3. `plans/AM1/*.png` — founder reference shots. `Screenshot …22.15.49.png` = the conversation style (embeds + fold). `Bild (5).png` = a **session work-log** — the thing that must NOT become conversation content.
4. `docs/human-interface-layer/thread-primitive.md` — the Thread/Message contract AM1 renders **within** (unchanged).
5. `docs/human-interface-layer/part-model.md` — **this concept's ground-truth output** (Conversation reshape + the Part model).
6. `docs/information-architecture/conversations-view.md` — the current Conversations surface this restyles.
7. `docs/process-layer/tasks-and-sessions.md` — the Session primitive (a session is referenced, never inlined).
8. `packages/shared/src/thread.ts` — `Message`, `PlainPayload`, `InlineRef` (`EntityRef | BlockRef | MentionRef`), `ArtifactRef`. Renders within these.
9. `packages/design-system/src/ThreadShell.tsx`, `RichMessageCard.tsx`, `CommentRow.tsx`, `Composer.tsx`; `packages/web/src/components/BlockRefEmbed.tsx`, `packages/design-system/src/ArtifactEmbed.tsx` — the existing rendering surface to factor.
10. `packages/web/src/components/SessionActivityPanel.tsx`, `packages/shared/src/harness/harness-events.ts` — the session-activity content that stays in the session view (AM3), not the conversation.
11. `.claude/rules/aesthetic-quality.md` — **no color/token changes**; structure and style only.

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **Conversation** | Reshaped | A deliberate, threaded exchange of messages between people and agents, rendered calmly and embedding-rich — within the Thread model. |
| **Part** | **New primitive** | The typed, source-agnostic rendering unit a Conversation (and the session view) is composed of. |
| **Part model** | **New primitive** | The shared rendering structure: the closed Part vocabulary + the calm reading-column layout + the Embed and Fold devices. The thing factored for reuse. |
| **Embed** | Reshaped | A Part that renders a referenced thing inline (artifact, block, diff, session reference) instead of as a bare link. |
| **Fold** | New (device) | The calm collapse-to-summary device on a Part ("Worked for 17s", a long reasoning list). |
| **Session reference** | New (satellite) | The Embed that points at a Session without inlining its work activity — the rejection-keeper. |
| Thread / Message / Verdict | Stable (input) | Unchanged. AM1 renders within them; does not reshape them. |
| Session | Stable (input) | Process-layer primitive (`docs/process-layer/tasks-and-sessions.md`). AM1 only *references* it. |
| Block (content primitive) | Stable (input) | The L2 markdown-derived primitive. Untouched and unrelated. The new names must avoid the word "Block". |

**Central noun:** Conversation. **Load-bearing new noun:** Part / the Part model (the shared structure AM3 reuses).

**Human-design-review forecast (advisory):** **Yes — confirmed.** AM1 introduces a new primitive (the Part model) and redesigns the most-used surface. `TRACK-AM.md` already forecasts `Yes`; Phase 0 confirms it. (`/design`'s `DESIGN-CLASS` remains authoritative; this is novel.)

---

## Phase 1 — Essence

### Conversation (reshaped)

- **Identity.** A Conversation is the *deliberate-messaging reading* of a Thread: a chronological exchange of messages that participants **choose** to send. It is an experience layered on the Thread primitive, not a new data shape.
- **Essential properties.** Threaded (attached to one host); composed of deliberate Messages (`plain | review | questionnaire | verdict`); each message may embed what it refers to; reads calmly (single column, quiet rhythm, foldable units); equal participants (humans + agents).
- **Rejection (see Phase 2).** Not a session work-log; not a live runtime activity stream; not a replacement for Thread.
- **Composition.** Renders a Thread's Messages through the **Part model**; hosts **Embeds** inside messages; may carry a **Session reference** Embed.
- **Lifecycle.** Inherits the Thread's — none of its own. (A Conversation is a rendering, not a stateful entity.)
- **Authority.** The Message rows are the source of truth (server-authoritative, event-bus-emitting). The Conversation is **derived** from them.

### Part / Part model (new primitive — the shared structure)

- **Identity.** A **Part** is one typed rendering unit. The **Part model** is the closed vocabulary of Part kinds + the calm reading-column layout + the Embed and Fold devices — i.e. the answer to "how does a thing read in this product."
- **Why it's the load-bearing noun.** A Part is **source-agnostic**: a *Message* renders to a Part (the Conversation), and a *session activity event* (`HarnessEvent` / `CapturedToolCall`) renders to a Part (the session view, AM3). That agnosticism is *exactly* what lets AM3 reuse the structure without re-implementing it — it is the AM1↔AM3 uniformity contract.
- **Essential properties.** Typed (closed kind set, `unknown` fallback); ordered in a single calm reading column; can host Embeds; can Fold to a one-line summary; **derived, never stored**.
- **Composition.** A Part carries a payload + zero-or-more Embeds + an optional Fold state. The Part model is composed *of* Parts.
- **Lifecycle.** None — derived per render from its source (a Message, or a session event). No persisted Part rows.
- **Authority.** The renderer owns Part construction; the source data (Messages / session events) owns truth. No Part is authored or stored directly.
- **Name rationale.** The industry uses two words for "a typed piece of rendered model content": Anthropic's API says *content **block***; the Vercel AI SDK says *message **part***. The hard rule forbids "Block", so we deliberately adopt the other industry term — **Part**. This is a literal industry noun, not a coined metaphor (consistent with the founder's purge of metaphor names — Rail, CoS — and the locked harness vocabulary).

### Embed (reshaped)

- **Identity.** A Part (or in-Part element) that renders the *thing a message refers to* inline as a compact card/chip, not a bare link.
- **Essential properties.** References exactly one entity; renders a legible preview of it; degrades safely when the source is gone (the existing `BlockRefEmbed` `degraded`/`error` states).
- **Embedding model (the AC2 requirement).** The closed set of what a deliberate message may embed: **artifact** (`ArtifactEmbed`), **referenced block** (`BlockRefEmbed`), **diff** (a referenced change, rendered as a compact `+N/−M` card — opens fuller detail elsewhere, never as a wall), **session reference** (a pointer to a Session), and the existing inline **entity refs / mentions** (`EntityRef`, `MentionRef`). Closed vocabulary; new embed kinds require a concept-doc update.
- **Authority.** The referenced entity owns its content; the Embed is a derived view of it.

### Fold (new device)

- **Identity.** The collapse-to-summary affordance on a Part — the single most important calm-making device (t3code-reference §2). A completed/long unit shows a one-line summary ("Worked for 17s", "12 lines of reasoning") and re-expands on demand.
- **Authority / state.** UI-local view state; never persisted, never part of the data model.

### Session reference (new satellite)

- **Identity.** The specific Embed that lets a Conversation point at a Session — "this message came out of / links to that work" — **without** inlining the session's activity.
- **Why it exists.** It is how the conversation honors AC4 ("a session is referenced from the conversation, not inlined as a work-log") while still letting the founder get from a message to the work. Clicking it enters the lower-level session dial-in (AM3); it does not expand a work-log inline.
- **Authority.** References a Session id (process-layer). The Conversation never owns session activity.

---

## Phase 2 — Rejection list (what these are NOT)

### Conversation is NOT…
1. **…a session work-log / transcript.** The t3 model (the agent's work-log *is* the conversation) is explicitly rejected. A Conversation is deliberate messages; session activity (tool calls, edits, diffs, reasoning) is **not** first-class conversation content. *Why:* it is HyperIdle's load-bearing distinction — blur it and we are building t3, not HyperIdle.
2. **…a live runtime activity stream.** Messages are *deliberate* — participants choose to send them. Auto-emitted runtime events (`HarnessEvent`) are not messages. *Why:* "deliberate" is what makes the conversation reviewable and trustworthy ("never act in the dark"); a firehose of events is not.
3. **…a new primitive that replaces Thread.** A Conversation renders *within* the Thread/Message/verdict model; it does not reshape host kinds, message types, or verdict semantics. *Why:* the Thread primitive is a stable, depended-on contract (L1, L7–L26); AM1 is a rendering reshape, not a data migration.

### Part model is NOT…
4. **…a "Block" or block-rendering system.** The name and the concept must avoid "Block"/"blocked". *Why:* the Block content primitive (L2, `docs/blocks/`) and the "blocked" task/thread state already own those words; collision would be a concept-level error (the hard rule).
5. **…conversation-only.** It is **source-agnostic** by design — the session view (AM3) renders its activity through the *same* Part model. *Why:* if it were conversation-coupled, AM3 would duplicate the renderer and the uniformity AC (AM1↔AM3) would be unmeetable.
6. **…stored data.** A Part is **derived** from a Message (or session event) at render time. There is no `part` table/column. *Why:* mirrors the L2 hard rule "Blocks are derived, never stored" — the Message rows stay the single source of truth; a stored Part would drift.

### Embed is NOT…
7. **…a bare link or attachment list.** An Embed renders the referenced thing legibly inline. *Why:* "embed things beautifully" is the founder's explicit ask and the whole point of the restyle.
8. **…(for a session) an inlined work-log.** A session Embed is a *reference* Part, not an expansion of the session's activity. *Why:* this is rejection #1 made concrete at the embed level.

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases / forbidden |
|---|---|---|
| **Conversation** | The deliberate-messaging reading of a Thread, rendered through the Part model. | not "chat log", not "transcript", not "session", not "work-log" |
| **Part** | A typed, source-agnostic rendering unit; the atom of the Part model. | **never "Block"**; not "card"/"row" (those are existing component shapes), not "entry", not t3code "part-as-work-log-event" |
| **Part model** | The shared rendering structure: closed Part vocabulary + calm reading column + Embed/Fold devices. Derived, never stored. | **never "Block model"/"blocked"**; not "stream"/"feed"/"timeline"/"transcript" (work-log-coded), not "composition" (purge-adjacent: AK1 guard flags `prompt-composition`; `Composer` exists) |
| **Embed** | A Part rendering a referenced entity inline. | not "link", not "attachment", not "preview" alone |
| **Fold** | The collapse-to-summary device on a Part. | not "collapse"/"accordion" as a primitive noun (those are behaviors of a Fold) |
| **Session reference** | The Embed pointing at a Session without inlining activity. | not "session log", not "activity embed" |

**Collision audit (Phase 6 grep, this codebase):** `Part` — 0 rendering uses (clean). `Fold` — only the verb "folds into" (clean). `Embed` — intentionally reused (`ArtifactEmbed`, `BlockRefEmbed`; AM1 formalizes the model). Rejected names and why: `Composition` (purge-adjacent + `Composer` clash), `Canvas` (116 hits, incl. `--bg-canvas` token + "on Canvas"), `Stream` (189 hits + work-log baggage), `Stack` (94), `Transcript` (21 + it *is* the rejected model), `Timeline` (24, ambiguous English). `Weave`/`Strand` rejected as cute textile metaphors (founder purges metaphors; overlaps the existing Knowledge **Fabric** and **Thread**).

---

## Phase 4 — Contracts

- **Cardinality.** A Conversation renders exactly one Thread (1:1 with the rendered Thread). A Message renders to exactly one Part. A Part hosts zero-or-more Embeds. An Embed references exactly one entity. A Conversation may carry zero-or-more Session references; a session reference points at exactly one Session.
- **Closure.** Part kinds are a **closed** vocabulary — adding one requires a concept-doc update first; the renderer dispatches by exhaustive discriminant and has an `unknown` fallback Part (mirrors Block's `unknown` kind). Embed target kinds are a **closed** set: `artifact | block | diff | session-reference | entity-ref | mention`.
- **Mutability.** Parts and Folds are **derived, never stored** — there is no persisted Part/Fold shape. Fold state is UI-local. The Message/Thread rows remain the sole mutable source of truth (with their existing immutability rules — payload immutable after persistence).
- **Identity.** A Part's identity derives from its source: the Message id (Conversation) or the session-event identity (session view). No new opaque id is minted. (Deterministic, like a Block's key.)
- **Hard rules (violating any breaks the concept):**
  1. **No "Block"/"blocked"** in any Part-model name (Part, Part model, Embed, Fold, Session reference).
  2. The **Part model is derived from Messages** (and, in the session view, from session events), **never stored** — no `part` table/column.
  3. **Session activity never renders as first-class conversation Parts.** A Session appears in a Conversation only as a **Session-reference Embed**; entering the activity is the lower-level dial-in (AM3).
  4. The **Part model is source-agnostic and reusable** — the session view (AM3) renders through it with **no duplicated renderer** (the AM1↔AM3 uniformity contract).
  5. **Thread / Message / verdict semantics are unchanged** — AM1 renders within them.
  6. **No color/token changes** — Hearth palette + `AESTHETICS.md` tokens unchanged; structure and rendering style only.

---

## Rationale

The founder studied t3code (2026-06-16) and wanted its **style** — the calm, embedding-rich way an agent chat reads — but explicitly **not its model**, where the agent's work-log *is* the conversation. The whole concept turns on protecting that line. So the concept does two things at once: (1) it reshapes **Conversation** into the calm, embedding-rich reading of *deliberate messages within Threads*, and (2) it introduces the **Part model** — a single, source-agnostic rendering structure — precisely so the lower-level **session view (AM3)** can reuse it and read uniformly, *without* the session's activity ever leaking into the conversation as first-class content. The `Part` noun is chosen as a deliberate, literal industry term (Vercel AI SDK) that sidesteps the forbidden "Block" (Anthropic API) — keeping the rendering vocabulary clean of the L2 content-primitive and the "blocked" workflow state. Get this line wrong and HyperIdle becomes t3; get it right and one rendering grammar serves both the conversation and the dial-in.

---

## Output

- `plans/AM1/concept.md` — this file.
- `docs/human-interface-layer/part-model.md` — ground-truth: the Conversation reshape + the Part model primitive (Embed, Fold, Session reference, contracts).
- `docs/human-interface-layer/index.md` — linked the new primitive.
- `docs/human-interface-layer/thread-primitive.md` — cross-reference note (Conversation/Part model render within Thread).
