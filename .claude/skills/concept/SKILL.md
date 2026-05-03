---
name: concept
description: "Aggregate pre-implementation pipeline: probe the concept, Run as the entry point on any story that introduces or reshapes a primitive, a domain concept, or a load-bearing noun in the system."
argument-hint: "[story-id-or-concept-name]"
user-invocable: true
min_tool_calls: 18
---

# Concept

**Why:** Before `/design` decides what the user sees and `/architecture` decides the technical shape, there's an even more upstream question: **what is this thing?** Get the concept wrong and downstream variants explore the wrong space — the design is for the wrong object, the architecture commits to the wrong contracts, and every later skill papers over the original confusion.

This is the layer where:
- **Thread** is distinguished from Message and Conversation
- **Block** is distinguished from Section, Document, and Markdown dialect
- **Artifact** is distinguished from Output, File, and Deliverable
- **Bet** is distinguished from Task and Story
- **Cost** is distinguished from Duration

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

If the founder is reachable, surface each probe with one AskUserQuestion (never batch). In autonomous mode, propose your answer in the concept doc and let `/architecture`'s in-session spec-alignment scoring catch it later if you got it wrong.

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

The concept is now **locked**. The downstream skills with the concept as fixed input — they explore *inside* the concept, never reshape it.

## Output of `/concept` end-to-end

```
docs/concept/<noun>.md              # Phase 5 output (or updated existing doc)
docs/work-packages/SHARED.md         # Phase 5 may add a "Shared Contracts" entry
```

## What this skill does NOT do

- It does not design, define an architecture or write tests or code. That's `/design`, `/architecture`, `/implement`.

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
- `/lore` — for *local* decisions inside an implementation file. Concept-level decisions live in `docs/concept/`, not in `@lore` comments.
