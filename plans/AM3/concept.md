# AM3 — Session view: concept (revisit)

Per-workpackage concept-lock for **AM3 — Session dial-in & activity view**. Supersedes the framing in `plans/AM3/design/approved.md` (attempt 1: a "config band + activity-log panel"), which the founder rejected as the **wrong primitive**. This doc reshapes the session as a **streaming human+agent conversation** and locks the Part-union extension before any redesign.

Concept level: **per-workpackage**. Inherits the AM1 track concept (`plans/AM1/concept.md`, `docs/human-interface-layer/part-model.md`) as a **fixed input** it must not contradict. Inherits the process-layer **Session** primitive (`docs/process-layer/tasks-and-sessions.md §6.2`) as a **stable** noun it renders, never reshapes.

---

## Required reading (downstream: `/design`, `/architecture`, `/pipeline`)

- `plans/AM3/concept.md` (this file) — the locked concept.
- `plans/AM3/research/session-following-analysis.md` + `t3code-source-findings.md` — the evidence dossier this concept is built on.
- `docs/human-interface-layer/part-model.md` — the AM1 Part/Embed/Fold contract this extends (must update at `/write-docs`).
- `packages/shared/src/part.ts` — the `PartKind`/`Embed`/`OpenTarget` vocabulary + `derivePartsFromSession` stub (the seam AM3 fills).
- `packages/web/src/services/open-handler.ts` — the `case "session"` no-op AM3 fills; entry/placement is SETTLED here (not a design fork).
- `packages/web/src/components/ConversationSurface.tsx` — the established surface AM3's session view is a reading of (header + PartList + composer).
- `packages/web/src/components/PartList.tsx` + `parts/*` — the source-agnostic renderer (extend the exhaustive dispatch; never fork).
- `packages/shared/src/harness/harness-capability-descriptor.ts` — composer pills render from `models` + `HarnessModelOptionDescriptor[]`.
- `packages/web/src/pages/review/ReviewCodeDiff.tsx` (+ `ReviewVisualDiff.tsx`) — the diff renderer the session REUSES (never re-invent).
- `docs/process-layer/tasks-and-sessions.md §6.2` — the process-layer Session (the execution noun the view reads).

---

## Phase 0 — The nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Session view** | The human-interface *reading* of a process-layer Session — a streaming, append-only human+agent conversation, two participants, the agent doing most of the talking by continuously appending text + interleaved tool calls + reasoning. | **Reshaped** (attempt 1 modeled it as controls+log; this re-models it as a streaming conversation) |
| **`tool` Part** | A new render kind: one tool call the agent made — verb + target + status + collapsed output, with batch aggregation. | **New** (extends the closed `PartKind` union) |
| **`reasoning` Part** | A new render kind: a span of agent thinking, rendered distinctly from answer text, collapsed to "Thought for Ns". | **New** (extends the closed `PartKind` union) |
| **Queued message** | A human message authored while the agent is working, held until the agent picks it up — does NOT interrupt/restart the agent. | **New** (a session state, not a Part kind — see Phase 1) |
| **Agent turn** | One agent response cycle: append-only streaming text interleaved with `tool`/`reasoning` Parts, terminating when the agent yields. | **New** (a grouping/lifecycle concept over Parts, not a stored entity) |
| **Process-layer Session** | One bounded agent run on a task (`tasks-and-sessions.md §6.2`): start, end, outcome, cost, three-phase Fabric lifecycle. | **Stable** — input, not reshaped |
| **Part / Embed / Fold / OpenTarget** | The AM1 render vocabulary. | **Stable** — extended (new kinds), contracts unchanged |
| **`diff` Embed** | Existing Embed kind (`part.ts:115`) carrying `label/meta/target`. | **Stable** — reused for file diffs (see Phase 4) |

**Human-design-review forecast:** `Yes`. AM3 introduces two new Part render kinds (`tool`, `reasoning`) — essential-component-shaped — plus a re-modeled surface. The `approved.md` already classified `DESIGN-CLASS: novel`; this revisit reaffirms it. (Advisory; `/design`'s `DESIGN-CLASS` at design time stays authoritative.)

Only the Reshaped + New nouns enter the rest of the skill. Stable nouns are inputs.

---

## Phase 1 — The essence

### Session view (the central reshape)

**Identity.** A Session view IS a **streaming, append-only human+agent conversation** — the same reading *shape* as a Conversation (AM1), specialized to exactly two participants (one human, one agent) where the agent dominates the column by continuously appending and streaming its output. It is a *reading*, derived from the session's execution events, exactly as a Conversation is the reading of a Thread's messages. It is **not** a controls form with a log beside it (attempt 1's category error).

This mirrors the AM1 move precisely: Conversation : Thread :: Session view : process-layer Session. The view adds no data shape; it derives Parts from session events through the same `Part[]` contract the Conversation uses.

**Essential properties.**
- **Two-party, agent-dominant.** One human + one agent. Authorship is carried by the SAME signal the HyperIdle Conversation already uses — **both** human and agent messages render **left-aligned**, author-grouped under a name · (agent glyph / "You") · time header (the `PartList` group-header pattern). The agent dominates by volume (continuous append), not by alignment. *Revised (founder review, 2026-06-22): the earlier "human = right-aligned bubble" came from t3code; the founder wants consistency with HyperIdle's OWN chat, where human messages appear on the left. The session view REUSES the conversation's human-message row — it does not invent a parallel right-aligned bubble.*
- **Append-only + streaming.** The agent's turn grows token-by-token; the column auto-pins to the newest content. This is a *dynamic* the model must name — attempt 1 rendered "populated only" and never modeled append/stream.
- **Heterogeneous Part stream.** Agent output is not one kind. It is **prose (answer text) + `tool` Parts (tool calls) + `reasoning` Parts (thinking) + `diff` Embeds (file changes)**, interleaved in source order. Modeling all of it as `prose` is what made attempt 1 a flat wall of text.
- **Reuses the AM1 renderer.** Renders through `PartList` over `derivePartsFromSession(...)`. No second/parallel renderer (AM1 hard-rule 4).
- **Reuses the conversation's components, not just its renderer (founder review, 2026-06-22).** The session view is the `ConversationSurface`'s OWN chrome — its header (host tag · title · avatar group), its avatars, its **human-message row**, and its **composer chrome (incl. the "+" attach affordance)** — ADDING only the session-specific bits: the new `tool`/`reasoning` render kinds, the folded tool aggregation, the descriptor-driven model/effort/mode pills, and the working/queue/Stop composer state. "Reuse components, don't invent new ones for the session view" is a hard direction, not a nicety. The session view = the conversation's components + the session-specific render kinds.
- **Composer stays usable while the agent streams.** The human can type and send mid-turn; the message queues (see Queued message). This diverges from t3code's Stop-only running state.

**Lifecycle (the session view's reading states — NOT the process-layer Session lifecycle).**
`idle` (agent yielded, composer = Send) → `streaming` (agent turn in progress, append-only, "Working for Ns", composer = Send-which-queues + Stop) → back to `idle` when the agent yields. A human send during `streaming` produces a **queued message**; the agent consuming it begins the next turn. The process-layer Session's own `start/end/outcome/cost` lifecycle (`§6.2`) is the *subject* being read and is unchanged.

**Authority.** Derived from the session's execution events (normalized harness activity — `HarnessEvent` / captured tool calls, per AM2's normalization), which remain server/runtime-authoritative. The view mints no source of truth; `derivePartsFromSession` is the only place that knows the session event shape, mirroring `derivePartsFromMessages` as the only place that knows `Message`.

### `tool` Part

**Identity.** One render kind for one tool call the agent made. A compact row, not prose. Carries the *anatomy* every reference shows: `[per-kind icon] [verb] [— target/preview, muted, truncated] [▾ expand] [status glyph]`, collapsed-by-default, expand-to-output.

**Essential properties (the carried shape — architecture turns into the exact type).**
- **verb / heading** — the action label ("Run command", "Read", "Edit", "Web search", "Search"), derived per kind.
- **target / preview** — the muted inline detail (command text, path, `# comment`), truncated; suppressed when equal to the verb.
- **status** — `running | ok | failed | neutral` (drives the trailing ✓ / ✗ / – glyph; only `failed` uses destructive color).
- **output** — optional collapsed body (mono `<pre>`, capped height); absent until expanded.
- **kind** — the tool family that picks the icon/verb (command / file-read / file-change / web-search / mcp / sub-agent / …). Closed set with a fallback so an unknown family still renders a generic row.
- **aggregation** — a run of consecutive `tool` Parts collapses to "N tool calls" / "Ran 4 commands, read a file". *Decision: aggregation is a renderer/adapter grouping concern over a homogeneous run of `tool` Parts, NOT a distinct Part kind.* Keeping it out of the union keeps the union small and the dispatch exhaustive; the grouping logic lives where author-grouping already lives (`groupParts` sibling).

A **file-change** tool call carries (or links) a `diff` Embed (Phase 4) — the diff is not a new Part kind.

### `reasoning` Part

**Identity.** One render kind for a span of agent thinking, rendered **distinctly from answer text** and **collapsed by default** to a one-line summary ("Thought for Ns"). It re-expands to muted/quieter reasoning prose. Same collapse-to-summary device as a turn fold; the references treat this as first-class and separate (AI SDK has a dedicated `Reasoning` component; t3code uses `tone:"thinking"` excluded from status glyphs).

**Essential properties.**
- **duration** — the elapsed thinking time, the resting-state summary label ("Thought for 14s").
- **text** — the reasoning body, rendered quieter than the answer; shown only on expand.
- No status glyph (reasoning is never success/failure).

*Decision: `reasoning` is its own Part kind, NOT a `prose` Part wrapped in a Fold.* The dossier floated both. A distinct kind is correct because (a) it carries a structural `duration` the renderer needs for the resting label, (b) it must render visually quieter than answer prose — a renderer concern that belongs in dispatch, not in ad-hoc Fold wrapping, and (c) every reference models it as a separate render unit. The Fold *device* is still used *inside* the `reasoning` renderer (collapse-to-"Thought for Ns"); the Part kind is what makes the dispatch carry the duration and the quiet styling.

### Queued message

**Identity.** A human message **authored while the agent is `streaming`**, held in a queue until the agent picks it up at the next turn boundary. It does **not** interrupt or restart the running agent (the founder's explicit divergence from t3code's Stop-only model and from a true interrupt).

**Essential properties.**
- It is a **session state on a not-yet-delivered human message**, not a new Part kind. It renders as a pending human bubble (lower opacity / clock affordance / "Queued · sends when the agent finishes") with a **dequeue/cancel ✕**.
- On consumption it **converts to a normal human-authored `prose` Part** (an ordinary human bubble) — it does not stay special once delivered. So the queue is a *pre-Part* staging state; once delivered it is just a Part. The Part vocabulary gains nothing for it.
- **Cancel** removes it from the queue without touching the running turn.
- **Ordering:** FIFO. Multiple queued messages are delivered in author order at the boundary.

*Decision: the queue is modeled as session-launch/composer state, NOT as a Part kind and NOT as a stored Message until delivered.* A queued message has no committed identity in the conversation until the agent consumes it; modeling it as a Part would force the renderer to carry a "pending" flag on every Part. Keeping it pre-Part keeps the Part union clean (it only ever sees delivered, real content).

### Agent turn

**Identity.** One agent response cycle — the append-only run of streaming prose + interleaved `tool`/`reasoning` Parts + `diff` Embeds, beginning when the agent picks up (a human message or a queued message) and ending when the agent yields. It is a **grouping + lifecycle concept over Parts**, like AM1's author-group, not a stored entity. A completed turn may fold to a one-line summary (a Fold over the group). A turn is what a queued message is delivered *into the start of*.

---

## Phase 2 — The rejection list (what a Session view is NOT)

1. **Not a "config band + activity-log panel."** (attempt 1) — because the center of gravity is the **streaming conversation**, not a controls form. Controls are a thin descriptor-driven pill strip on the composer, never a first-class top-of-panel zone competing for height. *This is the founder's core rejection.*

2. **Not a wall of `prose` Parts.** — because tool calls, reasoning, and diffs are **distinct render kinds** in every reference (t3code `tone`/`itemType`; AI SDK separate `Tool`/`Reasoning`/`Code Block`). Collapsing them to `prose` throws away the compact tool-row anatomy, status glyphs, aggregation, and diff chips — the exact calm-making devices. → extend the union.

3. **Not a deliberate-conversation work-log.** — because AM1 hard-rule 3 holds: the session work-log is **never** promoted into the Conversation column. A Conversation links to a Session via a `session-reference` Embed only. AM3 renders the work-log *inside its own session view*, through the shared structure, but the session view is a *different surface* from the deliberate Conversation. The Part *renderer* is shared; the *content stream* is not promoted.

4. **Not a t3code transcript-as-conversation for the deliberate conversation.** (MEMORY `project_conversation_not_session_am`) — because a Conversation = deliberate threaded messages people/agents *choose* to send; a Session = the lower-level dial-in that streams an agent's continuous output at finer grain. AM3 borrows t3code's **rendering vocabulary** (tool rows, reasoning blocks, diff panel) but **not** its IA (route-per-thread, branch toolbar, PR plumbing — out of scope).

5. **Not a new diff renderer.** — because `ReviewCodeDiff` already does the three-layer drill-down (L1 header / L2 ranked file cards / L3 hunks) and t3code itself reuses **one** `FileDiff` across session + review. The session's changed-files surface opens/inlines `ReviewCodeDiff` via the existing `diff` Embed. Re-inventing it duplicates a solved, heavy component.

6. **Not a Stop-only running state.** — because the founder's queue model keeps the composer usable mid-turn (human pushes, message queues). t3code's Stop-only + agent-pull-input model is the outlier; AM3 diverges deliberately.

7. **Not a reshape of the process-layer Session primitive.** — because `tasks-and-sessions.md §6.2` (one bounded agent run; start/end/outcome/cost; three-phase Fabric lifecycle) is **stable**. AM3 is the *reading* of that session; it adds no data shape and changes no session lifecycle, durability, or cost contract.

8. **Not an interrupt/restart on human send.** — because the founder's queue model is explicitly *append-and-pick-up-later*, not preempt. A queued message starts the *next* turn; it never tears down the running one.

9. **Not an inline tool-permission gate.** (founder review, 2026-06-22) — because HyperIdle has **no concept of allowing/denying individual tool edits**. The agent acts freely; the **review is the allow point** — the gate where a human accepts or rejects the agent's work happens at review time (Approve / Reject / Request Changes), NOT mid-stream on a per-tool "Allow this command?" prompt. The session view therefore renders **no** inline Allow/Deny permission prompt. (This removes the earlier aspect **h** permission-prompt card. The current *mode/permission* (Supervised / Accept-edits / Full-access) still reads as a descriptor composer pill — that is a launch setting, not an inline gate.)

10. **Not a t3code-style status-metrics roll-up.** (founder review, 2026-06-22) — because HyperIdle does not attach PRs to sessions and does not care about a change-count / Background / Artifacts counter bar above the stream. The header carries only a **minimal session identity** (agent · session title, in the conversation header shape). The per-turn / session changed-files surface (aspect **f**) stays — it is real work product the human reads — but the t3code metrics roll-up (aspect **p**) is **removed / out of scope**.

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Session view** | The streaming human+agent conversation reading of a process-layer Session. | session panel, dial-in panel, activity log, session transcript, "config band" |
| **`tool` Part** | Render kind: one tool call (verb/target/status/output). | activity entry, tool-call prose, work-log row, action card |
| **`reasoning` Part** | Render kind: a thinking span, collapsed "Thought for Ns". | thought prose, thinking message, chain-of-thought card |
| **Agent turn** | One append-only agent response cycle (prose + tool + reasoning interleaved). | response, completion, run (run = the process-layer Session) |
| **Queued message** | A human message held until the agent picks it up; does not interrupt. | pending input, draft, interrupt, agent-requested input (that is t3code's pull model) |
| **Aggregation** | Renderer grouping of a homogeneous `tool`-Part run to "N tool calls". | batch Part, summary Part |

**Naming guard (inherited from AM1):** the render unit is a **Part**, never a "Block". `tool`/`reasoning` are *Part kinds*. No "blocked"/"Block" in any name. (The lower-case task `blocked` state and the `Block` content primitive own that word; the Part model must avoid it — `part-model.md` naming guard.)

**Collision check (Phase 6 verifies via grep):** `tool` and `reasoning` as `PartKind` literals must not collide with existing `PART_KINDS` (`prose | review | resolved | questionnaire | unknown`) or `EMBED_KINDS`. "turn" must not be confused with the process-layer "run"/"session".

---

## Phase 4 — The contracts (the architecture builds on these)

### Part union extension — DECISION: **extend the closed `PartKind` union.**

Add **`tool`** and **`reasoning`** to `PART_KINDS`. Rationale: prose-only loses every calm-making device the references rely on (attempt-1 failure mode); a parallel renderer violates AM1 hard-rule 4. Extending the closed union is the only option that earns the compact rows AND keeps one renderer. The union stays **closed + exhaustive + `unknown`-terminated**, so the cost is bounded: two new dispatch arms in `PartList`, two new `parts/*` renderers, the `assertNeverPart` exhaustiveness guard still compiles.

New union members (shape the architecture turns into exact TS; carried fields named, not finalized):

```
| (BasePart & { kind: "tool";
      verb: string;              // "Run command" | "Read" | "Edit" | "Web search" | …
      target?: string;          // muted truncated preview (command/path/# comment)
      toolKind: ToolKind;       // closed family → icon/verb; unknown-tolerant
      status: "running" | "ok" | "failed" | "neutral";
      output?: string;          // collapsed mono body; absent until expanded
      // embeds: may carry a `diff` Embed for a file-change tool call (Phase 4 diff contract)
  })
| (BasePart & { kind: "reasoning";
      durationMs: number;       // → "Thought for Ns" resting label
      text: string;             // quiet body, shown on expand
  })
```

- **Closure contract.** `PartKind` stays closed: `prose | review | resolved | questionnaire | tool | reasoning | unknown`. Adding a kind requires a concept-doc update first (this doc is that update for `tool`/`reasoning`). `ToolKind` is itself a closed family set with a generic fallback (an unrecognized tool family renders a generic tool row, never throws — mirrors the `unknown` Part discipline).
- **Exhaustiveness contract.** `PartList`'s switch gains `case "tool"` + `case "reasoning"`; `assertNeverPart` keeps compile-time exhaustiveness + a non-throwing runtime `UnknownPart`. A drifted/unrecognized kind on the wire still degrades to `unknown` (no throw).
- **AM1 contracts preserved.** No "Block"/"blocked" name; no color/token change (Hearth + AESTHETICS.md unchanged — only failure status uses the existing destructive token); Parts derived-never-stored; identity derives from the source event (no new opaque id minted).

### Aggregation contract
A consecutive run of `tool` Parts in one turn MAY render as one aggregate ("N tool calls" / aggregate verb) with the overflow behind a fold. Aggregation is a **renderer/adapter grouping** over homogeneous `tool` Parts — NOT a Part kind. It lives beside `groupParts`. Cardinality: aggregate group → 1..n `tool` Parts.

### Diff reuse contract (reconciling `diff` Embed ↔ `ReviewCodeDiff`)
- A **file-change** activity surfaces through the **existing `diff` Embed kind** (`part.ts:115`: `label/meta/target`), carried on the `tool` Part's `embeds` (a file-change `tool` Part) and/or a per-turn changed-files surface.
- The `diff` Embed's `OpenTarget` opens/inlines **`ReviewCodeDiff`** — the session does **NOT** introduce a new diff renderer (rejection 5; AM1 hard-rule "reuse"). `meta` carries the `+N/−N` stat for the chip; `target` routes to the diff surface.
- **Hard rule:** one diff renderer in the product. The session reuses `ReviewCodeDiff`/`ReviewVisualDiff`; any new per-file diff component for the session is a concept violation.

### Streaming contract (the append-only agent turn)
- An **agent turn** is append-only: Parts are appended in source order; the rendered column auto-pins to the newest Part; the pin is suppressed during user-initiated fold/expand so the view never yanks.
- A turn is a **derived grouping**, not a stored entity. Identity of each Part still derives from its source event. The "Working for Ns" indicator is turn-scoped resting state while `status === streaming`.
- **Cardinality:** Session view → 0..n turns; turn → 1..n Parts (prose/tool/reasoning) + 0..n `diff` Embeds.
- **Mutability:** a streaming `prose` Part's text grows (append) until the turn yields; a `tool` Part's `status` transitions `running → ok|failed|neutral` and may gain `output` — these are *derived* updates from new events, never stored mutations of a Part row (there are no Part rows).

### Queue contract (the queued human message)
- A queued message is **pre-Part session/composer state**, FIFO, with a `cancel`. It is NOT a Part and NOT a stored Message until delivered.
- **Delivery:** at the next turn boundary the agent consumes the queue head; on consumption it becomes a normal human-authored `prose` Part (an ordinary bubble). Cardinality: session → 0..n queued messages; on delivery each → exactly one `prose` Part.
- **Hard rule:** a queued message **never interrupts or restarts** the running turn. It starts the *next* turn. (Founder divergence from t3code.)
- **Mutability:** a queued message is editable/cancellable only while queued; once delivered it is an immutable delivered Part like any other.

### Composer-controls contract (inherited from AM2, reaffirmed)
- The composer **reuses the conversation's composer chrome** (its rounded input + "+" attach affordance, same look as the conversation — founder review 2026-06-22) and ADDS a **compact descriptor pill strip**: controls render from the **`HarnessCapabilityDescriptor`** (`models` + `HarnessModelOptionDescriptor[]`): `select`→pill, `boolean`→toggle, `number`/`text`→input — **never per-backend-branched** (AM2 constraint). A model declaring no effort option → no effort pill (AC2 proof). These are a compact composer pill strip, not a config band (rejection 1). The model/effort/mode/permission pills are **launch settings**, not inline tool-permission gates (rejection 9). Do NOT invent a parallel composer.
- No inline permission/approval prompt is rendered (rejection 9). No status-metrics roll-up bar is rendered (rejection 10) — the header carries only minimal session identity.

### Entry/exit contract — **SETTLED. Not a design fork.**
- The session view is reached through the **existing `session` `OpenTarget`** (`packages/web/src/services/open-handler.ts`, `case "session"` — the documented no-op AM3 fills) fired from a `session-reference` Embed in a Conversation. How a referenced thing opens is **already solved** by the Conversation/Review surfaces; AM3 inherits it unchanged.
- The surface itself is the established **`ConversationSurface`** pattern (`packages/web/src/components/ConversationSurface.tsx`): header + a `PartList` Part column + composer chrome. AM3's session view is a `ConversationSurface`-shaped *reading* of a process-layer Session — the SAME surface, fed the SAME `Part[]` contract through `derivePartsFromSession`. **Placement (route vs panel vs split) is NOT a design fork** — attempt-2's three placement variants were the wrong axis (founder, 2026-06-22). The relevant design exploration is the **rendering vocabulary of the session content** (Part 7 below), not where the surface sits.
- Entry mechanism niceties (dismissible, Escape-close, conversation stays mounted) ride on the existing open seam; AM3 invents no new placement chrome.

---

## Phase 5 — Ground-truth deltas (for `/write-docs`, NOT applied now)

This concept does not edit `docs/` ground truth (that is `/write-docs` later). The precise deltas it commits architecture to:

1. **`docs/human-interface-layer/part-model.md`** — extend `PartKind` closure list to `prose | review | resolved | questionnaire | tool | reasoning | unknown`; add `tool` + `reasoning` to the "As built" Part-kind description; note the session view as the second surface that renders through `PartList` (it already names AM3 as the reuse seam — this fills it). Add the **streaming** + **queue** contracts and the **diff-reuse** hard rule. No Embed-kind change (`diff` already exists). No color/token change.
2. **`docs/process-layer/tasks-and-sessions.md`** — unchanged (Session primitive stable). Optionally a one-line cross-reference noting the human-interface *reading* of a session lives in the Part model. Not required.
3. **No `docs/process-layer/canonical-shapes.md` change** — no cost/token/duration contract touched (AM3 reads cost; it does not introduce a budget axis — the duration-cap rejection stays intact).

**Contract delta summary (feeds `/architecture`):**
- `PART_KINDS` gains `tool`, `reasoning` (closed union; exhaustive dispatch + `unknown` fallback preserved).
- New closed `ToolKind` family set with generic fallback.
- `derivePartsFromSession(...)` grows from stub to a real adapter over normalized session events (NOT raw per-backend `HarnessEvent`) → `Part[]`, with append/stream handling + `tool`-run aggregation.
- Aggregation = renderer grouping beside `groupParts`; not a Part kind.
- Queued message = pre-Part composer/session state, FIFO, cancellable, non-interrupting; delivers to a `prose` Part.
- `diff` Embed reused → `ReviewCodeDiff`; no new diff renderer.
- Composer pills from `HarnessCapabilityDescriptor`; no per-backend branch.

---

## Phase 6 — Self-critique

- **Is the rejection list distinct?** Yes — 8 rejections across 4 axes: surface shape (1, 6), content modeling (2, 5, 8), conceptual boundary (3, 4), primitive boundary (7). Not flavors of one thing.
- **Vocabulary collision?** `tool`/`reasoning` verified absent from `PART_KINDS` and `EMBED_KINDS` (`part.ts:34,96`). "turn" is new to the Part model — distinct from process-layer "run"/"session". No "Block"/"blocked" introduced. No clash with `tasks-and-sessions.md` (its `blocked` is the lower-case task state, explicitly walled off).
- **Contracts complete?** Cardinality (turn↔Parts, session↔queued, aggregate↔tool), closure (`PartKind` + `ToolKind` both closed with fallback), mutability (Parts derived/never-stored; streaming = derived append; queue editable-only-while-queued), identity (derives from source event, no new id), hard rules (no interrupt; one diff renderer; no token/color change). No hand-wave.
- **Rationale concrete?** Yes — every decision cites the founder reframe (2026-06-22 primers), the attempt-1 failure modes (`approved.md` + dossier §12), the references (t3code/AI SDK), and AM1 hard-rules. Not "for clarity".
- **Right files touched?** This concept reshapes the AM1 Part model — `part-model.md` is the right ground-truth target (deferred to `/write-docs`). The process-layer Session doc correctly stays untouched (stable noun). No other concept doc needs editing.

**One issue addressed:** the aggregation-as-Part-kind temptation. Resolved by making aggregation a renderer grouping (Phase 4), keeping the union at exactly two new kinds. This keeps the closed-union cost bounded and the exhaustive dispatch small.

Concept **locked**. (Autonomous mode: `PIPELINE_INTERACTIVE` not `1` → no recap gate, no `AskUserQuestion`.)

---

## Part 7 — The session's "various aspects" to display (the design surface)

**Entry/placement is settled** (Phase 4 entry contract). The real design exploration is: **how do we DISPLAY the tool calls and every other aspect of a live session, calmly, inside the one `ConversationSurface`?** This is the taxonomy the design must give a *rendering language* for. Each aspect names what it IS and the existing primitive it builds on — there is a lot to build upon; the design composes, it does not reinvent.

### A. Agent-output aspects

| # | Aspect | What it IS | Builds on |
|---|---|---|---|
| **a** | **Streaming answer text** | The agent's primary output — progressive markdown (headings, lists, inline `code`, fenced code blocks), token-by-token. Two resting states: *in-progress* (a quiet caret / "still typing") vs *settled*. Empty-while-streaming renders nothing (no placeholder flash). | `ProsePart` look; build wires the real `ChatMarkdown`. Fenced code → `CodeRenderer` (DS). A streaming `prose` Part whose text grows (Phase 4 streaming contract). |
| **b** | **Reasoning / "Thought for Ns"** | A span of agent thinking, rendered quieter than the answer, collapsed by default to an elapsed-time summary; re-expands to muted prose. Never a success/fail glyph. | the **`reasoning` Part** kind (Phase 4) + the `Fold` collapse device. Carries `durationMs` for the resting label. |
| **c** | **Tool calls — BY FAMILY** | One compact row per tool call: `[per-kind icon] [verb] [— target/preview, muted] [▾ output] [status]`. Each family has its own icon/verb and its own expanded I/O shape: **run-command** (cmd + stdout + exit code); **read/view file** (path + preview); **edit/write file** (path + `+N/−M` diff → `ReviewCodeDiff`); **search/grep** (query + matches); **web search/fetch** (query/url + results); **MCP tool call** (server/tool + args + result); **sub-agent/task spawn** (a nested mini-stream); **create/delete** (path + verb). | the **`tool` Part** kind + a closed `ToolKind` family set with a generic fallback (Phase 4). One row renderer; per-kind icon/verb/output shape. |
| **d** | **Tool-call STATES** | `running` (pulsing dot) / `ok` (✓) / `failed` (✗, the only state that uses the destructive token) / `neutral` (–). A **failure must read distinctly** — destructive status glyph + the error surfaced in the expanded output (stderr / `exit code N` / `ENOENT`), so a broken step is glanceable, not buried. | `status` field on the `tool` Part; `--status-error`/`--status-success` tokens (no new tokens). |
| **e** | **Tool aggregation** | A consecutive run of tool rows collapses to one summary verb — "Ran 4 commands, read a file" / "N tool calls" — overflow behind a fold. Keeps a 30-call turn from being a wall. A *failed* call inside a run surfaces on the aggregate so failure is never hidden by aggregation. | a renderer **grouping beside `groupParts`** (Phase 4 aggregation contract), NOT a Part kind. |
| **f** | **File diffs / changed files** | Two surfaces, both → `ReviewCodeDiff`: (1) an **inline `+N/−M` diff chip** on a file-change `tool` row; (2) a **per-turn / session changed-files surface** (file list + totals + "View diff"). Never a new diff renderer. | the existing **`diff` Embed** (`part.ts:115`) carried on the `tool` Part; opens/inlines **`ReviewCodeDiff`** (rejection 5). `ChangeBadge` stat look mirrored. |
| **g** | **Cost / token usage tick** | A quiet per-turn (or session) usage read — tokens / cost — in muted micro-text, never competing with content. Reads cost; introduces no budget axis (Phase 5 note). | a muted micro-row; `tabular-nums`; mirrors `ArtifactCostChip` look. |
| **h** | ~~Permission / approval prompt~~ — **REMOVED** (founder review, 2026-06-22; rejection 9) | HyperIdle has **no inline tool-permission gate** — the agent acts freely, and the **review** is the allow point. The session view renders **no** Allow/Deny prompt. | — (removed). The current **mode/permission** (Supervised / Accept-edits / Full-access) still reads as a descriptor composer pill (aspect **o**) — a launch setting, not an inline gate. |
| **i** | **Artifacts produced** | A reference to a thing the agent made (a doc, an image, a dataset) surfaced inline as a chip that opens its owned surface. | the `artifact` `OpenTarget` + **`ReferenceChip`** / `ArtifactEmbed` (DS) — no inline viewing surface (AM1 hard-rule). |
| **j** | **Sub-agent / nested session (recursion)** | A sub-agent `tool` call (aspect c) is itself a Session — so its row carries a **`session` `OpenTarget`** and **opens its OWN nested session view** (the same surface, recursed: a session's sub-agent row → the sub-agent's session view, rendered identically). *Enhanced (founder review, 2026-06-22): "this could yet again open a session view just of the sub agent."* This is the inline form; the previous session-scoped "Background N" roll-up belonged to the removed metrics bar (aspect **p**) and is out of scope. | a sub-agent `tool` row with an "open session" affordance carrying a `session` `OpenTarget`; opens the SAME `ConversationSurface`-shaped session view recursively (same open seam as every other reference). |
| **k** | **Plan / todo** | A short checklist the agent is following — steps with done / active / pending state — rendered as a calm compact list, distinct from prose. | a compact list (composition); reuses the `Fold` device to collapse a long plan; **not** a new DS primitive (a checkbox-row list look). |

### B. Interaction aspects

| # | Aspect | What it IS | Builds on |
|---|---|---|---|
| **l** | **Human message + QUEUED human message** | Sent human turn = the **conversation's left-aligned author-grouped row** (name · "You" · time header, full-width body) — REUSED from `PartList`, NOT a right-aligned bubble *(revised, founder review 2026-06-22: align with HyperIdle's own chat)*. A message authored while the agent streams = a **queued, not-yet-delivered** pending row (muted / clock + "sends when the agent finishes") with a **dequeue ✕**. Non-interrupting; FIFO; converts to a normal delivered human `prose` Part on delivery. | the conversation's human-message row (`PartList` group + `ProsePart`); the queue is **pre-Part composer/session state** (Phase 4 queue contract), not a Part kind. |
| **m** | **Identity / timestamps / turn boundaries + completed-turn fold** | Two-party authorship by the SAME signal the conversation uses — **both** human and agent render left-aligned, author-grouped under a name · (agent glyph / "You") · time header (the conversation's avatars in the surface header). Name · time at a turn boundary; a completed turn may **fold to a one-line summary** ("Worked for 1m 12s · Show"). | the conversation's `PartList` group header + `ConversationSurface` avatars (`clockTime`, `groupParts`) — REUSED, not reinvented; the `Fold` device for the turn fold. |
| **n** | **Working state + Stop** | While the agent runs: a quiet "Working for Ns" self-ticking indicator + a **Stop** control. Calm — pulsing dots + elapsed micro-text, not a loud spinner. | turn-scoped resting state (`status === streaming`, Phase 4); a bare Stop button. |
| **o** | **Composer with descriptor pills + Send/queue** | **The conversation's composer chrome, REUSED** (its rounded input, its "+" attach affordance with the SAME look as the conversation — founder review 2026-06-22) + ADDING a compact left **pill strip** rendered from the `HarnessCapabilityDescriptor` (model / effort / mode) + a right Send (idle) that becomes **Send-which-queues + Stop** while streaming. Never per-backend-branched: a model declaring no effort option shows no effort pill. | the **`ConversationSurface` composer** (input + "+" attach button look) + the **`HarnessCapabilityDescriptor`** (AM2): `select`→pill, `boolean`→toggle (Phase 4 composer contract). Do NOT invent a parallel composer. |
| **p** | ~~Session status roll-ups~~ — **REMOVED** (founder review, 2026-06-22; rejection 10) | The t3code Changes/PR/Background/Artifacts metrics strip is **out of scope** — HyperIdle attaches no PRs to sessions and does not surface a change-count counter. The header carries only minimal session identity (agent · title). | — (removed). Real changed-files work product still surfaces via the per-turn changed-files panel (aspect **f**); a Ready-for-review verdict belongs to the review surface, not a metrics bar here. |
| **q** | **Scroll-to-bottom / auto-pin** | The stream auto-pins to the newest content while streaming; the pin is suppressed during a user-initiated expand (so the view never yanks); a "Scroll to bottom" pill appears when the user scrolls up. | a bare pill; the streaming-contract auto-pin (Phase 4). |

**What the design must produce:** a coherent **rendering language** that gives every aspect above a calm, glanceable home inside the one `ConversationSurface`, **reusing the conversation's OWN components** (its header + avatars, its left-aligned human-message row, its composer chrome incl. the "+" attach affordance) plus the catalogued vocabulary (PartList, `parts/*`, `Fold`, `ReferenceChip`, `ArtifactEmbed`, `ReviewCodeDiff`, the DS catalog, the AM2 descriptor) — composing, never reinventing. The session view ADDS only the session-specific render kinds (`tool`/`reasoning` Parts, the folded tool aggregation, the descriptor pills, the working/queue/Stop state, the sub-agent → nested session affordance). The variants explore the **vocabulary axis** (disclosure/density of a tool row; tool-row grammar; how I/O & diffs reveal; how reasoning/cost/aggregation read), **never** placement, and **no inline permission gate** (rejection 9) and **no metrics roll-up** (rejection 10).

**Locked direction (founder review, 2026-06-22):** Variant 1 — "Calm Transcript" — chosen ("I prefer this calm aspect with the various tool calls closed and combined in an expander"). The folded-at-rest tool aggregation IS the chosen behavior. The full set of applied annotations + the single approved rendering language live in `plans/AM3/design/approved.md`.
