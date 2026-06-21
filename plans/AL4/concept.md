# AL4 — Concept: Inline Anchored Review Comments

**Workpackage:** AL4 (Track AL). Per-workpackage concept act, downstream of the locked AL1 review concept.
**Date:** 2026-06-19
**Status:** LOCKED. Extends `plans/AL1/concept.md` and `docs/human-interface-layer/review-primitive.md`; downstream `/design` + `/architecture` explore *inside* this concept, they do not reshape it.

> **What this concept answers.** AL1 locked the review as a dual-anchored, Subject-level experience with one global Thread and reference chips as a placeholder for inline comments. AL4 answers: what is the precise anchor shape that lets a comment in that one global Thread bind to a specific spot inside an artifact, render there, and survive edits? The answer is a small family of three nouns — `AnchorRef`, `AnchorTarget`, `Anchored Comment` — plus the content-following semantics shared with Rationale entries.

---

## Required reading (downstream `/design`, `/architecture`, `/pipeline` must read these)

- `.pipeline/work-packages/TRACK-AL.md` — AL4 spec.
- `plans/AL1/concept.md` — locked review nouns (Subject, Intent, Rationale, Reviewer, Anchor). This file extends the Anchor noun for inline commenting.
- `docs/human-interface-layer/review-primitive.md` — the review surface AL4 targets.
- `docs/human-interface-layer/thread-primitive.md` — the one global Thread per Subject; `plain`/`inline-comment` message types; verdict semantics unchanged.
- `docs/blocks/canonical-shapes.md` and `docs/blocks/composition.md` — `BlockId`, `BlockAnchor`, and the `block` extension to thread attachment / `InlineRef`.
- `packages/shared/src/thread.ts` — `PlainPayloadWithBlockId` scaffolding.
- `plans/AL1/design/approved.md` — the approved composition; anchored comments replace the reference-chip placeholder.

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **AnchorRef** | **New** (satellite) | The address a comment carries: which artifact, which block, and an optional human-readable spot label (`PromoField.tsx:118`). |
| **AnchorTarget** | **New** (satellite) | The resolved runtime object inside a canvas — the block + the specific line/paragraph/step/region/cell the label names — where the comment renders. |
| **Anchored comment** | **New** (composite) | A `plain` or `inline-comment` Thread message whose payload carries an `AnchorRef`; it renders at the `AnchorTarget` and participates in the one global Review Thread. |
| **Review** | **Stable** (input) | The dual-anchored Subject-level experience from AL1. Unchanged. |
| **Thread** | **Stable** (input) | The one conversation per Subject; unchanged except it now hosts messages with `AnchorRef`. |
| **Block / BlockId** | **Stable** (input) | The block primitive from `docs/blocks/`. Reused as the stable identity layer. |
| **Subject** | **Stable** (input) | The set of Artifacts under review. Comments anchor into Artifacts inside it. |

---

## Phase 1 — Essence

### Definition

An **inline anchored comment** is a piece of feedback in a Review's single global Thread that is bound to a precise, content-following spot inside one of the Subject's Artifacts. Its address is an `AnchorRef` (`artifactId` + `blockId` + optional spot label). Its rendering is an `AnchorTarget` resolved by the artifact's canvas at read time. It threads replies like any other message and does not alter the Subject-level verdict.

### Essential properties

Every anchored comment has:

1. **A stable block identity.** The anchor uses `blockId` from the derived Blocks of the artifact's content, never pixel coordinates, line numbers, or character offsets. Block IDs derive from normalised content + outline path (`docs/blocks/canonical-shapes.md`).
2. **An artifact scope.** The `AnchorRef` names the `artifactId` so the comment belongs to exactly one Artifact within the Subject, even when the right pane is closed.
3. **An optional spot label.** A short human-readable label (`line 118`, `paragraph 3`, `step "verify balance"`, `region A`, `cell B7`) that disambiguates a finer grain inside the block for the renderer and the reviewer.
4. **Thread membership.** It is a message in the Review's one global Thread, not a separate per-spot conversation. Replies are nested Thread replies.
5. **Content-following semantics.** When the artifact content changes, re-derivation re-resolves the `blockId`. If the block no longer exists, the comment degrades to a "source changed" orphaned state rather than silently attaching elsewhere.
6. **Verdict neutrality.** Its presence does not change the Review lifecycle or verdict grammar. It can be added to open or re-opened Reviews.

### What an anchored comment is not (rejection list)

**Anchored comment is NOT:**

- **…a separate per-file or per-spot thread.** The rejection from AL1 stands: there is one Review Thread. Anchored comments participate in it; they do not spawn a second thread hierarchy.
- **…a coordinate-based annotation.** Figma/Word/char-offset anchoring is rejected. Binding by geometry orphans comments when content shifts; binding by block identity survives edits.
- **…a rich-diff editing surface.** AL4 is comment + reply. Suggest-mode, AI-suggested edits, and line-level patches are follow-on work.
- **…a verdict or action.** An anchored comment never approves, rejects, or executes anything; it is feedback.
- **…a block reference (`refs[].kind = "block"`).** A block reference is an inline embed / citation inside any message on any Thread. An anchored comment is positional: it renders next to the block it addresses, inside the artifact canvas.

**AnchorRef is NOT:**

- **…a renderer-agnostic universal pointer.** It is deliberately minimal: artifactId + blockId + optional label. Each canvas family maps its own content to `AnchorTarget`.
- **…enough to render without the artifact context.** The address is uninterpretable until the canvas resolves blockId against the artifact's derived Blocks.

**AnchorTarget is NOT:**

- **…persisted.** It is a runtime resolution of an `AnchorRef` against the current artifact render tree.
- **…a new primitive identity for comments.** It is purely the resolved spot used for placement.

### Composition

```
Review (one Thread)
└─ Message { type: plain | inline-comment }
   └─ payload: PlainPayloadWithBlockId { text, refs, blockId }
      ↓ carries
   AnchorRef { artifactId, blockId, spotLabel? }
      ↓ resolves through
   Artifact canvas's deriveBlocks / per-kind renderer
      ↓ to
   AnchorTarget { block, spot } inside the canvas DOM/render tree
```

- **AnchorRef belongs to** one message in the Review Thread.
- **AnchorRef points to** one `artifactId` inside the Subject.
- **AnchorRef points through** the artifact's `blockId` (derived from the artifact's stable Block set).
- **AnchorTarget is produced by** the artifact's family canvas at render time, using the blockId plus optional spot label to place a comment marker / inline thread.
- **Replies attach to** the anchored comment message as normal Thread replies.

### Lifecycle

1. **Create.** Reviewer selects a spot in an artifact canvas; UI produces an `AnchorRef`; client posts a `plain` or `inline-comment` message with `blockId` and a `refs[]` entry that names the artifact and spot label. The Thread accepts it as any other message.
2. **Render.** Canvas resolves the `blockId` to a Block; the optional spot label selects a sub-spot. If resolved: render the comment marker at the `AnchorTarget`. If not resolved: render an orphaned "source changed" marker in the conversation.
3. **Reply.** Any participant replies to the anchored message; replies show in the inline thread and in the global thread.
4. **Resolve content changes.** When the artifact body is re-derived, the same `blockId` is looked up again. A matching block keeps the comment attached; a missing block orphans it.
5. **Review termination.** A binding Verdict terminates the Review as before. Anchored comments remain readable in the resolved record; new ones cannot be added after resolution.

### Authority

- **Source of truth for the comment text** is the Thread message (server-authoritative, append-only, soft-delete allowed per `thread-primitive.md`).
- **Source of truth for the anchor** is the message payload (`blockId` + `refs` entry) — immutable after persistence, same audit invariant as all message payloads.
- **Source of truth for whether the anchor still resolves** is the current derived Block set of the artifact, computed at render time.
- **Who creates:** any Review participant (human or agent Reviewer).
- **No self-review constraint applies at the message level.** The producing agent cannot issue the Verdict, but feedback messages follow ordinary Thread authorship rules.

### Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **AnchorRef** | The address a comment carries: `artifactId` + `blockId` + optional `spotLabel`. | anchor reference, pin id, coordinate ref, pointer |
| **AnchorTarget** | The resolved spot (block + optional sub-spot) inside a rendered artifact canvas. | target element, DOM ref, render anchor, resolved pin |
| **Anchored comment** | A Review Thread message that carries an `AnchorRef` and renders at the resolved `AnchorTarget`. | inline thread, diff comment, annotation, inline note |
| **Spot label** | Optional human-readable sub-block label (line/paragraph/step/region/cell). | line number, offset, coordinate, position |
| **BlockId** | Stable content-derived identifier of a Block (reused from Block primitive). | block id, paragraph id, node id |
| **ArtifactId** | Identifier of one Artifact inside the Subject. | file id, document id |
| **Orphaned** | Anchor state when the referenced block no longer resolves. | lost, broken, stale pin |

### Contracts

- **Cardinality.** One anchored comment has **one** `AnchorRef`. One `AnchorRef` addresses **one** artifact and **one** block within it. A single message may only anchor to **one** `AnchorRef`. A block may have **many** anchored comments.
- **Closure.** `AnchorRef` shape is closed (`artifactId`, `blockId`, optional `spotLabel`). `spotLabel` semantics are canvas-resolved; the local namespace is closed per canvas family: `{ line, paragraph, step, region, cell }`. No arbitrary JSON extension.
- **Mutability.** Message payload immutable after persistence; replies append; block re-derivation may change whether the anchor resolves. AnchorRef content is not edited in place — a correction is a new message.
- **Identity.** Anchored comment identity = the underlying Thread message id. `AnchorRef` has no separate id.
- **Hard rules.**
  1. **Anchors bind to block identity, never coordinates.** Violating this reintroduces the Word/Figma orphaning failure mode.
  2. **One global Thread per Review.** Anchored comments do not create side threads.
  3. **A spot label is optional and opaque to the server.** The server stores it; the canvas resolves it.
  4. **An anchor cannot migrate to a different block.** If the block is gone, the comment is orphaned; it never silently reattaches to a near-match.
  5. **Subject-level verdict is untouched.** Anchored comments are feedback, not verdict actions.
  6. **Canvas-agnostic address, canvas-specific resolution.** The address format is shared; each family canvas decides how it maps its own content to an `AnchorTarget`.

### Rationale

AL1 named the central tension of the review experience as **examine vs. converse**: reviewers need a big examination surface *and* a precise conversation channel at the same time. The reference-chip placeholder solved context but not precision; the research showed that robust content-following anchoring is the loved differentiator and fragile geometry-based anchoring is the hated failure. `AnchorRef` keeps the address minimal and stable (`blockId`) while letting each artifact canvas resolve the fine-grained `AnchorTarget` in its own terms — code lines, prose paragraphs, visual regions, spreadsheet cells. Reusing the existing `PlainPayloadWithBlockId` scaffolding and the global Thread avoids inventing a new conversation primitive; AL4's only new work is the binding between a Thread message and a rendered spot.

---

## Phase 2 — Rejection list (what these are NOT)

(See §Essential properties / "What an anchored comment is not" above.)

---

## Phase 3 — Vocabulary lock

(See Vocabulary table above.)

---

## Phase 4 — Contracts

(See Contracts above.)

---

## Phase 5 — Ground-truth updates

- `plans/AL4/concept.md` — this file (per-WP concept lock).
- `docs/human-interface-layer/review-primitive.md` — update §Composition surface to replace "reference-chip placeholder" with "content-following anchored comments resolved via block identity" and add an `AnchorRef` contract line.
- `packages/shared/src/thread.ts` — `PlainPayloadWithBlockId` already supports `blockId`; verify the optional spot label is carried via `refs` or extend the type minimally if required (architecture decision, not concept).

---

## Phase 6 — Self-critique (1 round)

- **Address minimal enough?** Yes — `artifactId + blockId + optional spotLabel` is the thinnest address that survives edits and works across canvas families.
- **Coordinate rejection explicit?** Yes — hard rule 1 names Word/Figma orphaning as the failure mode; no geometry survives.
- **Thread model preserved?** Yes — anchored comments are ordinary Thread messages with a block anchor; one global Thread per Review stands.
- **Canvas resolution not overspecified?** Yes — `AnchorTarget` is runtime-resolved; AL4 does not prescribe DOM structure per family.
- **Vocabulary collisions?** "Anchor" already exists in AL1 as the content-following pin; `AnchorRef` / `AnchorTarget` are the AL4-specific spin-outs. "Block" keeps its existing meaning. No conflicting primitive.
- **Contracts complete?** Cardinality, closure, mutability, identity, and hard rules pinned. The exact `refs[]` encoding of the spot label is deferred to `/architecture`.
- **Right files?** Per-WP concept lands in `plans/AL4/`; downstream `docs/human-interface-layer/review-primitive.md` gets an update.

**Concept LOCKED.**
