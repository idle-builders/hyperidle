---
name: concept
description: "Aggregate pre-implementation pipeline: probe the concept, then run /design + /design-critique + /architecture + /architecture-critique. Produces concept-doc in docs/concept/, approved design in docs/design-explorations/, and a critiqued plan ready for /write-tests. Run as the entry point on any story that introduces or reshapes a primitive, a domain concept, or a load-bearing noun in the system."
argument-hint: "[story-id-or-concept-name]"
user-invocable: true
---

# Concept

**Why:** Before `/design` decides what the user sees and `/architecture` decides the technical shape, there's an even more upstream question: **what is this thing?** Get the concept wrong and downstream variants explore the wrong space — the design is for the wrong object, the architecture commits to the wrong contracts, and every later skill papers over the original confusion.

This skill is the **aggregate pre-implementation phase**, the mirror of `/implement` for the build phase. Phases 0-6 lock the concept; phases 7-10 invoke `/design`, `/design-critique`, `/architecture`, and `/architecture-critique` so the entire chain produces a single coherent output ready for `/write-tests`. The pipeline runs each sub-skill discretely as its own step; `/concept` is the convenience wrapper for manual use.

This is the layer where:
- **Thread** is distinguished from Message and Conversation
- **Block** is distinguished from Section, Document, and Markdown dialect
- **Artifact** is distinguished from Output, File, and Deliverable
- **Bet** is distinguished from Task and Story
- **Cost** is distinguished from Duration

The L-track founder reframe — *"every discussion is a thread; every knowledge piece is a block; every output is an artifact"* — is exactly the kind of conceptual lock-down this skill produces. Track-L L1/L2/L3/L4/L5 all begin with **concept-doc updates** as the first AC; this skill is what writes them.

## When this runs

- **In the pipeline:** step 0 — before `/design`, before `/architecture`. The very first skill on any story that introduces or reshapes a primitive, a domain concept, or a load-bearing noun in the system.
- **On `/concept <story-id>`:** explicit invocation. Do this whenever you read a story and find yourself unsure what the central noun *is*, or when the story uses a term inconsistently with `docs/concept/` or `docs/work-packages/SHARED.md`.
- **Skip when:** the concept is already locked in `docs/concept/` and the story does not reshape it. (Confirm by reading the relevant `docs/concept/*.md` section first; if it answers every question in Phase 1 below without contradiction, skip.)

## Required reading

1. The story in `docs/work-packages/TRACK-<letter>.md` — what nouns does it use? Which are central, which are incidental?
2. `docs/work-packages/SHARED.md` "Shared Contracts" — does the noun already have a contract here?
3. `docs/concept/*.md` — the canonical concept docs. Read every section that names the noun or its neighbours.
4. `docs/concept/archive/` — prior versions of concept decisions. If the noun used to be defined differently, that's load-bearing context.
5. Any related stories that already shipped (per `pipeline-manifest.yaml` or `progress.json`).

If the spec contradicts an existing concept doc, that's a CRITICAL finding before any other work. Surface it; don't silently re-define.

## Phase 0 — Identify the thing

Name the noun(s) the spec keeps using. Often there's one central noun and 2-3 satellite nouns. List them with one-line working definitions in your own words, then check each against `docs/concept/` and SHARED.md.

For each noun, classify it:
- **New primitive** — not in the system yet; this story introduces it. (L1 Thread, L2 Block, L3 Artifact were each this.)
- **Reshaped concept** — exists but the story changes what it means or what it commits to. (L4 reshaping Cost+Tokens away from Duration.)
- **Stable concept** — exists and the story uses it as-is. No concept work needed for this noun.

Only New + Reshaped nouns enter the rest of this skill. Stable nouns are inputs.

## Phase 1 — Probe the essence (one question at a time)

For each New / Reshaped noun, walk the decision tree. Ask hard questions ONE AT A TIME, propose your read based on the spec / existing docs, let the human (or in autonomous mode the adversary) confirm, override, or dig deeper.

**One question at a time.** A list of ten dumps invites the easy ones to be answered and the hard ones to become silent assumptions that surface as bugs years later when the concept is already load-bearing.

The seven essential probes (adapt; don't ask all of them — pick what's actually unsettled):

1. **Identity.** "What IS a `<noun>` in one sentence — what kind of thing is it (container? event? snapshot? relationship? capability?)? My read: …"
2. **Essential properties.** "What properties must every `<noun>` have for it to be a `<noun>` at all (vs accidental properties some have)? My read: …"
3. **Rejection list.** "What is a `<noun>` *not*? What adjacent thing is tempting to fold in but is actually a different concept? My read: `<noun>` is not X because Y."
4. **Composition.** "What other concepts does a `<noun>` carry, host, or attach to? My read: a `<noun>` attaches to {hosts}, carries {payload}, is referenced by {references}."
5. **Lifecycle.** "What states does a `<noun>` move through, and what causes each transition? My read: …"
6. **Authority.** "Who owns / produces / mutates a `<noun>`? Where does the source of truth live? My read: …"
7. **Vocabulary collision.** "Does `<noun>` clash with an existing term in `docs/concept/` or `SHARED.md`? Is it used inconsistently inside this same story? My read: …"

Stop probing when the concept is sharp, not when you run out of questions. Three to seven branches is typical for a new primitive; one or two for a reshape.

If the founder is reachable, surface each probe with one AskUserQuestion (never batch). In autonomous mode, propose your answer in the concept doc and let `/architecture-critique`'s spec-alignment dimension catch it later if you got it wrong.

## Phase 2 — Probe the rejection list

The list of what a concept ISN'T is as load-bearing as what it IS. The L-track scope rules name explicit rejections (no keyboard verb shortcuts, no optimistic-UI bragging, no sidebar drag-reorder, no emoji reactions, no cycles UI, no search-modifier mini-language, no customizable dashboards) — these aren't taste, they're concept-level decisions about what the system isn't.

For each New / Reshaped noun, write down at least three things it is NOT:
- Adjacent concepts it could be confused with → why they're different
- Tempting extensions → why they don't belong in this concept
- Existing patterns the team has seen elsewhere → why we're rejecting them here

Each rejection has a reason. "We don't do X because Y" — Y is the load-bearing part.

## Phase 3 — Lock the vocabulary

Pick one canonical term per concept. List the aliases that are *not* allowed:
- Other terms used in the same story for the same thing (collapse to one)
- Terms from prior systems / existing code that mean something different (rename or rescope)
- Translations (if the system is bilingual) — mark which language is authoritative

Format inline in the concept doc:

```md
| Term | Definition | Aliases not to use |
|---|---|---|
| **Thread** | Container for messages, attached to a host entity. | conversation, chat, dialog |
| **Message** | Element inside a thread; plain or rich. | post, comment, entry |
```

If the project later adopts a `/domain-glossary` skill, this becomes one of its inputs.

## Phase 4 — Probe the contracts

Concepts commit the system to contracts. Make them explicit:
- **Cardinality contracts.** Does every `<noun>` attach to exactly one host? Many? Zero or one? Choose and write it.
- **Closure contracts.** Is the type vocabulary closed (adding a new variant requires a concept-doc update first) or open (callers extend freely)?
- **Mutability contracts.** Once created, what's immutable? What can change? Who can change it?
- **Identity contracts.** What gives a `<noun>` its identity — opaque ID, content hash, deterministic key?
- **Hard rules.** Anything that, if violated downstream, means the implementation has broken the concept. (TRACK-L L2 has one: "On-disk format stays GitHub-flavoured markdown. Blocks are derived, never stored.")

Each contract is one line. The architect later turns these into types, schemas, and guards. Concept work commits to the *shape*, not the implementation.

## Phase 5 — Write or update `docs/concept/`

The output is a concept doc, not a chat summary. Write to:
- A new section in `docs/concept/<existing-doc>.md` if the concept fits an existing layer (Thread → `HUMAN_INTERFACE_LAYER.md`, Block → `HUMAN_INTERFACE_LAYER.md` + `BLOCKS.md`, Artifact → `HUMAN_INTERFACE_LAYER.md` + `PROCESS_LAYER.md`).
- A new `docs/concept/<NOUN>.md` if the concept is large enough to warrant its own doc (TRACK-L L2 explicitly calls for `BLOCKS.md`).
- An update to `docs/work-packages/SHARED.md` "Shared Contracts" so downstream stories reference it without re-inventing.

Doc structure (adapt sections that aren't relevant; don't pad):

```md
## <Noun> primitive

**Definition.** One sentence — what kind of thing it is.

**Essential properties.** Bullet list. What every <noun> has.

**What it is not.** Bullet list. The rejection list with reasons.

**Composition.** What it attaches to, carries, is referenced by.

**Lifecycle.** States and transitions, if any.

**Authority.** Who owns / produces / mutates.

**Vocabulary.** Term table (canonical + aliases not to use).

**Contracts.** Cardinality, closure, mutability, identity, hard rules.

**Rationale.** The founder reframe or design tension that drove this shape (one paragraph). Future agents need to know WHY, not just WHAT, so they don't re-litigate.
```

## Phase 6 — Adversary challenge on the concept

Spawn an **adversary agent** to challenge the concept (NOT the downstream design / plan — that comes later):
- Is the rejection list a real list of distinct things, or three flavours of one thing?
- Does the canonical term collide with an existing term in the codebase or in `docs/concept/`? (`grep` to verify.)
- Are the contracts complete, or do they hand-wave on cardinality / closure / mutability / identity?
- Is the rationale concrete (cites a founder reframe, a constraint, a prior bug) or generic ("for clarity")?
- Did the concept-doc update touch the right files? Are there other concept docs that need to mention this change?

Address critical issues. Max 1 round.

The concept is now **locked**. Phases 7-10 invoke the downstream skills with the concept as fixed input — they explore *inside* the concept, never reshape it.

## Phase 7 — `/design` (skip when no UI surface)

Invoke `/design $ARGUMENTS`. The skill spawns three parallel `designer` sub-agents under different constraints, each producing an embodied HTML mockup + screenshot, runs `/design-critique` per variant, and synthesises into `docs/design-explorations/<id>/approved.md`.

The concept doc (Phase 5 output) is the fixed input. Variants explore *visual / interaction shape*; they do not redefine what the noun IS.

**Skip when** the story has no user-facing surface — pure backend / schema / infra / concept-doc-only. Concept-only stories (e.g. TRACK-L L4 Cost+Tokens reshape, L5 Knowledge relevance) end at Phase 6 plus a thin Phase 9 architecture pass for the typed exports SHARED.md needs.

If invoked, Phase 7 must produce `approved.md` before proceeding.

## Phase 8 — `/design-critique` on the approved design

Invoke `/design-critique` against the approved design from Phase 7. Score must reach ≥7 across the nine-dimension rubric (visual hierarchy, spacing & density, typography, color, component coherence, states & feedback, accessibility, anti-slop, premium polish). Iterate within the critique loop's max 4 iterations.

If the score plateaus below 7, that's a Phase 7 problem — the variants didn't span the right space. Surface and either re-run Phase 7 with new constraints or escalate to the founder.

**Skip when** Phase 7 was skipped.

## Phase 9 — `/architecture`

Invoke `/architecture $ARGUMENTS`. The architect interrogates the spec one-question-at-a-time (Phase 0 of `/architecture`), reconciles spec ⇆ codebase (Phase 1), produces acceptance criteria + ordered task list + type signatures + route checklist + security & abuse cases + protected tests (Phase 2), runs design-it-twice on non-trivial sub-decisions (Phase 3), and challenges with the adversary (Phase 4).

Fixed inputs at this phase:
- The concept doc (Phase 5 output)
- The approved design from Phase 7 if UI is in scope

The architect does NOT redefine the concept or the visual contract; they *plan within them*.

## Phase 10 — `/architecture-critique` on the plan

Invoke `/architecture-critique`. Score the plan against the nine-dimension architectural rubric (spec alignment, layer integrity, API contracts, data model alignment, naming, module depth, failure-mode coverage, simplicity, verifiability). Iterate fixes IN THE PLAN until score ≥7 or 3 rounds reached.

If after 3 rounds the score still won't cross 7, the **concept** may be the problem — surface and consider returning to Phase 0 with a sharper concept brief.

## Output of `/concept` end-to-end

```
docs/concept/<noun>.md              # Phase 5 output (or updated existing doc)
docs/work-packages/SHARED.md         # Phase 5 may add a "Shared Contracts" entry
docs/design-explorations/<id>/       # Phase 7 output (when UI is in scope)
  ├── brief.md
  ├── <variant-a>/{spec.md, mockup.html, screenshot.png}
  ├── <variant-b>/{spec.md, mockup.html, screenshot.png}
  ├── <variant-c>/{spec.md, mockup.html, screenshot.png}
  ├── comparison.md
  ├── synthesis.md
  └── approved.md                    # design-critique score ≥7
TaskCreate plan                       # Phase 9 + Phase 10 — architecture-critique score ≥7
```

The plan from Phase 9-10 is the input to `/write-tests` (`/implement` step 1). At this point every load-bearing decision is locked: what the noun IS, how it looks, how it's typed.

## What this skill does NOT do

- It does not write tests or code. That's `/implement` (or `/write-tests` + `/write-code` discretely).
- It does not pick a colour, a font, or a copy register beyond what `/design` settles on.
- It does not lock implementation choices that can be changed without changing the concept (e.g. SQLite vs PostgreSQL — a contract is "the schema is dual-driver", not "use SQLite").

Concepts are the part that is *expensive to change*; they ripple through every downstream variant in design and every contract in architecture. Get them right, then let design and architecture explore freely within them.

## Anti-patterns

- **Skipping straight to design.** "I'll figure out what a Thread is by drawing it." → you'll draw three different things and call them Thread.
- **Concept by code.** Looking at the existing TypeScript type and calling that the concept. The type is one possible expression of the concept, not the concept itself.
- **Empty rejection list.** If you can't say what the concept ISN'T, you don't understand what it IS.
- **Vibes-only definitions.** "A Thread is a way to talk about things" is not a definition; it's a hand-wave.
- **Re-litigating in `/design` or `/architecture`.** Once the concept doc lands, the visual variants and the technical plan operate inside it. They do not redefine it.
- **One mega-question dump.** Probes are one at a time. A list of seven questions is one easy answer plus six silent assumptions.

## Cross-references

- `/design` — consumes the concept as the fixed input; explores how the user perceives and interacts with it.
- `/architecture` — consumes the concept and the design; produces the technical plan that respects the contracts.
- `/architecture-critique` Dimension 1 (Spec Alignment) and Dimension 5 (Naming) audit whether the plan respects the concept; misalignments score against the plan, not against the concept.
- `/lore` — for *local* decisions inside an implementation file. Concept-level decisions live in `docs/concept/`, not in `@lore` comments.
