---
name: concept
description: "Aggregate pre-implementation pipeline: probe the concept, Run as the entry point on any story that introduces or reshapes a primitive, a domain concept, or a load-bearing noun in the system."
argument-hint: "[story-id-or-concept-name]"
user-invocable: true
min_tool_calls: 18
---

# Concept

Upstream of `/design` and `/architecture`. Answers "what IS this thing?" — the layer where Thread is distinguished from Message, Block from Section, Artifact from Output, Bet from Task, Cost from Duration.

**Skip when:** the concept is already locked in `docs/` and the story doesn't reshape it. Read the relevant section files first; if they answer Phase 1 without contradiction, skip.

## Required reading

1. Story in `plans/work-packages/TRACK-<letter>.md` — central vs incidental nouns.
2. `plans/work-packages/SHARED.md` "Shared Contracts" — does the noun already have a contract?
3. `ls docs/` to identify relevant topic folders, then read `index.md` and drill into the specific `docs/<topic>/<file>.md` sections that match the noun.

**Output a "Required reading" section** listing the specific doc files downstream agents (`/architecture`, `/implement`) must read for this story.

If the spec contradicts an existing concept doc, that's CRITICAL. Surface it; don't silently re-define.

## Phase 0 — Identify the thing

Name the noun(s) the spec keeps using. Often there's one central noun and 2-3 satellite nouns. List them with one-line working definitions in your own words, then check each against the specific `docs/<topic>/<file>.md` you identified in Required reading and against SHARED.md.

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
7. **Vocabulary collision.** "Does `<noun>` clash with an existing term in any specific `docs/<topic>/<file>.md` or in `SHARED.md`? Is it used inconsistently inside this same story? My read: …"

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

## Phase 5 — Write the per-story concept doc and update ground truth

The output is a concept doc, not a chat summary. Write to:
- `plans/concept/<story-id>.md` — the per-story concept-locking output (always). This is what `/architecture` reads as a fixed input.
- A specific `docs/<topic>/<noun>.md` ground-truth file if the concept fits an existing layer (Thread → `docs/human-interface-layer/threads.md`, Block → `docs/blocks/<file>.md`, Artifact → `docs/process-layer/artifacts.md`). Update or create the specific file — do not write to a generic folder.
- An update to `plans/work-packages/SHARED.md` "Shared Contracts" so downstream stories reference it without re-inventing.

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
- Does the canonical term collide with an existing term in the codebase or in any specific `docs/<topic>/<file>.md`? (`grep` to verify.)
- Are the contracts complete, or do they hand-wave on cardinality / closure / mutability / identity?
- Is the rationale concrete (cites a founder reframe, a constraint, a prior bug) or generic ("for clarity")?
- Did the concept-doc update touch the right files? Are there other concept docs that need to mention this change?

Address critical issues. Max 1 round.

The concept is now **locked**. The downstream skills with the concept as fixed input — they explore *inside* the concept, never reshape it.

## Output of `/concept` end-to-end

```
plans/concept/<story-id>.md           # Phase 5 per-story concept-locking output (always)
docs/<topic>/<noun>.md                # Phase 5 ground-truth update (specific file, when applicable)
plans/work-packages/SHARED.md         # Phase 5 may add a "Shared Contracts" entry
```

## What this skill does NOT do

- It does not design, define an architecture or write tests or code. That's `/design`, `/architecture`, `/implement`.

Concepts are the part that is *expensive to change*; they ripple through every downstream variant in design and every contract in architecture. Get them right, then let design and architecture explore freely within them.

## Anti-patterns

- Skipping to design before defining the concept.
- Concept by code (the type is one expression of the concept, not the concept).
- Empty rejection list.
- Vibes-only definitions.
- Re-litigating the concept in `/design` or `/architecture`.
- One mega-question dump (probes are one at a time).

## Target

$ARGUMENTS
