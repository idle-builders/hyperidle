# Concept — AG3: Bet authoring is block editing

## Classification

**No New or Reshaped nouns.** Both load-bearing nouns are **stable**:

| Noun | Classification | Source of truth |
|---|---|---|
| **Bet** | Stable | `docs/process-layer/bets-shape-commit-change-ship.md`, `docs/process-layer/canonical-shapes.md` |
| **Block** | Stable | `docs/blocks/` (definition, composition, canonical-shapes, contracts) |

AG3 is an **experience-parity** workpackage. It changes *where* a bet's body is authored (full-page surface instead of a cramped modal), not *what* a bet or a block is. No primitive is introduced or reshaped. `/design` and `/architecture` explore inside these locked concepts — they do not re-litigate them.

No blocker: the spec introduces no genuinely new noun. "Authoring surface" / "authoring journey" are UI surfaces, not domain primitives — they belong to `/design`, not `/concept`.

## Required reading (downstream: /design, /architecture, /pipeline)

- `docs/blocks/composition.md` — §4: the bet pitch is a Block host; the body owns the blocks derived from it. There is no orphan block.
- `docs/blocks/canonical-shapes.md` — the `deriveBlocks(body, host)` contract; `BlockHostKind` includes `'bet'`; hard rule "on-disk format stays GitHub-flavoured markdown — Blocks are derived, never stored."
- `docs/process-layer/bets-shape-commit-change-ship.md` — §5.1 Shape: a pitch is problem + appetite + sketches + rabbit-holes + no-gos; shaping is *not* decomposition.
- `docs/process-layer/canonical-shapes.md` — Bet object shape (status, team, appetite, body, done_condition).
- `docs/blocks/where-blocks-render.md` — the shared block-rendering pipeline both bet detail and knowledge use.

## Established contracts AG3 must honor

These are inherited, not decided here. Any downstream design or plan that violates one has broken the concept.

1. **Bet content = block-derived markdown body.** A bet's pitch is a GFM markdown body. Blocks are *derived* from it at render time via `deriveBlocks(body, { kind: 'bet', id })`. The authoring surface edits the markdown body; it never edits or stores blocks directly. **No new storage dialect** — the on-disk/in-DB shape stays the same markdown string the bet already carries today.

2. **One rich body editor component, three hosts.** The same shared rich body editor is used by (a) knowledge create/edit, (b) bet create, (c) bet detail edit. AG3 reuses this component **as-is**. No second editor implementation. The work is the *journey around* the editor (page chrome, commitments, save feedback, abandon flow), not the editor itself.

3. **Bet pitch is a Block host (`hostKind = 'bet'`).** Already true today; preserved. Content authored through the new flow must derive into the same `Block[]` and render identically in bet detail — headings, lists, and anchored-discussion affordances all preserved (`attachedTo = { kind: 'block', blockId, hostKind: 'bet', hostId }`).

4. **Bet-specific commitments are part of the Bet, not the body.** `team` and `appetite` are Bet object fields (`docs/process-layer/canonical-shapes.md`), distinct from the body's blocks. They are collected during creation but live *beside* the writing surface, never inside the body content. A bet cannot be created without the commitments required today.

5. **Backward compatibility.** Bets created before AG3 render unchanged. The bet creation API contract is preserved or evolved compatibly (additive only). The body string, the derivation, and the render pipeline are untouched.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Bet** | Time-boxed commitment object of the process layer; carries a markdown pitch body + commitments (team, appetite, done_condition). | wager, project, initiative, ticket |
| **Pitch / body** | The markdown body of a bet — problem, appetite, sketches, rabbit-holes, no-gos. The thing the editor edits. | description, content blob, prose box |
| **Block** | A derived, normalised AST node materialised from a markdown body. Never authored or stored directly. | section, chunk, fragment |
| **Commitments** | Bet-specific structured fields set at creation: `team`, `appetite`. Live beside the body, not in it. | metadata, fields, form fields |
| **Authoring surface** | The full-page UI for writing a bet's pitch (create + edit). A UI surface, not a primitive. | bet form, create modal, editor page |

Note on track-ID drift: `docs/blocks/` uses L-track story IDs (L16 = bet pitch host, L23 = knowledge body, L26 = per-block discussion). This workpackage is AG3 in the AG track; same primitives, different track-naming generation. No concept collision — AG3 is the experience-parity follow-up that makes bet authoring match knowledge authoring.

## Rationale

Founder reframe (2026-06-12): "When you add a new bet that's the wrong editor — that should be the exact same experience as when editing a block in the knowledge, because the content on the bet is also a block." The block architecture already states bet content and knowledge content are the *same kind of thing* (both are markdown bodies that derive into `Block[]`). The current UI contradicts that — bet content gets a cramped modal box while knowledge gets a generous full-page surface. The inconsistency teaches a false model: that bet content is a lesser kind of text. AG3 removes the contradiction at the UI layer without touching the underlying concept, which was already correct.
