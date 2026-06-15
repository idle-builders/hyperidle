---
name: concept
description: "Aggregate pre-implementation pipeline: probe the concept, Run as the entry point on any workpackage that introduces or reshapes a primitive, a domain concept, or a load-bearing noun in the system."
argument-hint: "[workpackage-id-or-concept-name]"
user-invocable: true
min_tool_calls: 18
---

# Concept

Upstream of `/design` and `/architecture`. Answers "what IS this thing?" — the layer where Thread is distinguished from Message, Block from Section, Artifact from Output, Bet from Task, Cost from Duration.

**Two levels of concept.** Be explicit about which you are doing:
- **Overall (track) concept** — what a whole worktrack does: the boundary, primitive, or load-bearing nouns its workpackages all share. This is the frame `/work-planning` requires to be *defined enough* before it registers a track's workpackages. Output: the `docs/<topic>/` ground truth + a `plans/<track>/concept.md`.
- **Per-workpackage concept** — the concept specific to one workpackage (its own noun/shape). Run before that workpackage's `/architecture` (the pipeline gates it). Output: `plans/<workpackage-id>/concept.md` + any `docs/` ground-truth it reshapes.

The phases below apply to either level — at track level the "noun" is the whole track's primitive/boundary; at WP level it's the workpackage's specific noun. A per-WP concept inherits the track concept as a fixed input and must not contradict it.

**Skip when:** the concept is already locked in `docs/` and the workpackage doesn't reshape it. Read the relevant section files first; if they answer Phase 1 without contradiction, skip.

## Required reading

1. Workpackage in `.pipeline/work-packages/TRACK-<letter>.md` — central vs incidental nouns.
2. Existing canonical-shapes / contract docs under `docs/<topic>/` (e.g. `docs/blocks/canonical-shapes.md`, `docs/process-layer/canonical-shapes.md`, `docs/process-layer/artifact-primitive.md`, `docs/human-interface-layer/thread-primitive.md`, `docs/architecture/event-bus-guarantees.md`, `docs/agent-layer/harness-error-taxonomy.md`) — does the noun already have a contract?
3. `ls docs/` to identify relevant topic folders, then read `index.md` and drill into the specific `docs/<topic>/<file>.md` sections that match the noun.

**Output a "Required reading" section** listing the specific doc files downstream agents (`/architecture`, `/pipeline`) must read for this workpackage.

If the spec contradicts an existing concept doc, that's CRITICAL. Surface it; don't silently re-define.

## Phase 0 — Identify the thing

Name the noun(s) the spec keeps using. Often there's one central noun and 2-3 satellite nouns. List them with one-line working definitions in your own words, then check each against the specific `docs/<topic>/<file>.md` you identified in Required reading and against any canonical-shapes contract docs under `docs/`.

For each noun, classify it:
- **New primitive** — not in the system yet; this workpackage introduces it. (L1 Thread, L2 Block, L3 Artifact were each this.)
- **Reshaped concept** — exists but the workpackage changes what it means or what it commits to. (L4 reshaping Cost+Tokens away from Duration.)
- **Stable concept** — exists and the workpackage uses it as-is. No concept work needed for this noun.

Only New + Reshaped nouns enter the rest of this skill. Stable nouns are inputs.

**Refine the human-design-review forecast (advisory).** Concept is where new nouns/components first surface, so it is the right place to *refine* the planning-time **Human design review.** forecast field in the WP's track doc (`/work-planning` sets it initially). If Phase 0 classifies a noun as a **New primitive** or an essential / base component, refine that field to `Yes` in the track doc. Keep it advisory — this is a forecast, not the gate; `/design`'s `DESIGN-CLASS` at design time remains authoritative (a `Yes` forecast does not force review if `/design` classifies `routine`, and a `No` forecast does not suppress it if `/design` classifies `novel`).

## Phase 1 — Probe the essence

For each New / Reshaped noun, walk the decision tree. Pick only the probes that are actually unsettled — skip the ones where the spec or existing concept docs already pin the answer. For each remaining probe, propose your read with the evidence you have, then ask the human (or in autonomous mode the reviewer) to confirm, override, or dig deeper. Issue all probes for a noun in one parallel batch — independent probes don't need separate round-trips, and the cost adds up across seven essentials × N nouns.

**Few, important questions.** Three sharp probes force a real decision; ten low-stakes ones get answered with shrugs while the load-bearing assumption stays silent and surfaces years later as a load-bearing bug. The bar to ask is: "will the answer change the concept doc?" If no, don't ask.

The seven essential probes (adapt; don't ask all of them — pick what's actually unsettled):

1. **Identity.** "What IS a `<noun>` in one sentence — what kind of thing is it (container? event? snapshot? relationship? capability?)? My read: …"
2. **Essential properties.** "What properties must every `<noun>` have for it to be a `<noun>` at all (vs accidental properties some have)? My read: …"
3. **Rejection list.** "What is a `<noun>` *not*? What adjacent thing is tempting to fold in but is actually a different concept? My read: `<noun>` is not X because Y."
4. **Composition.** "What other concepts does a `<noun>` carry, host, or attach to? My read: a `<noun>` attaches to {hosts}, carries {payload}, is referenced by {references}."
5. **Lifecycle.** "What states does a `<noun>` move through, and what causes each transition? My read: …"
6. **Authority.** "Who owns / produces / mutates a `<noun>`? Where does the source of truth live? My read: …"
7. **Vocabulary collision.** "Does `<noun>` clash with an existing term in any specific `docs/<topic>/<file>.md` (including canonical-shapes contracts)? Is it used inconsistently inside this same workpackage? My read: …"

Stop probing when the concept is sharp, not when you run out of questions. Three to seven branches is typical for a new primitive; one or two for a reshape.

If the founder is reachable, surface each probe with one AskUserQuestion (never batch). In autonomous mode, propose your answer in the concept doc and let `/architecture`'s in-session spec-alignment scoring catch it later if you got it wrong. Note: the per-probe `AskUserQuestion` branch here is the *probe-time* interaction; the *post-lock* recap gate (see "## Recap gate" below) is separate — it fires once, after lock, governed by the canonical `PIPELINE_INTERACTIVE` rule, not by per-probe reachability.

## Phase 2 — Probe the rejection list

The list of what a concept ISN'T is as load-bearing as what it IS. The L-track scope rules name explicit rejections (no keyboard verb shortcuts, no optimistic-UI bragging, no sidebar drag-reorder, no emoji reactions, no cycles UI, no search-modifier mini-language, no customizable dashboards) — these aren't taste, they're concept-level decisions about what the system isn't.

For each New / Reshaped noun, write down at least three things it is NOT:
- Adjacent concepts it could be confused with → why they're different
- Tempting extensions → why they don't belong in this concept
- Existing patterns the team has seen elsewhere → why we're rejecting them here

Each rejection has a reason. "We don't do X because Y" — Y is the load-bearing part.

## Phase 3 — Lock the vocabulary

Pick one canonical term per concept. List the aliases that are *not* allowed:
- Other terms used in the same workpackage for the same thing (collapse to one)
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

Each contract is one line. The designer later turns these into types, schemas, and guards in `/architecture` mode. Concept work commits to the *shape*, not the implementation.

## Phase 5 — Write the per-workpackage concept doc and update ground truth

The output is a concept doc, not a chat summary. **The concept file always belongs in the workpackage folder, inside the feature worktree** — never loose in the repo root or an ad-hoc path. Write to:
- `plans/<workpackage-id>/concept.md` — the per-workpackage concept-locking output (always), at `plans/<workpackage-id>/concept.md` (for a concept that spans a whole track, use the track folder `plans/<track>/concept.md`). `plans/` is tracked, so this file is committed with the run and persists across worktrees — it is what `/architecture` reads as a fixed input. It is later retired by `/write-docs` once its essence lives in the `docs/` ground truth below.
- A specific `docs/<topic>/<noun>.md` ground-truth file if the concept fits an existing layer (Thread → `docs/human-interface-layer/threads.md`, Block → `docs/blocks/<file>.md`, Artifact → `docs/process-layer/artifacts.md`). Update or create the specific file — do not write to a generic folder.
- An update to the matching `docs/<topic>/canonical-shapes.md` (or sibling contract file) so downstream workpackages reference it without re-inventing.

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

## Phase 6 — Challenge the concept (in-session self-critique)

Switch to adversarial thinking. Challenge your own concept — NOT the downstream design / plan:
- Is the rejection list a real list of distinct things, or three flavours of one thing?
- Does the canonical term collide with an existing term in the codebase or in any specific `docs/<topic>/<file>.md`? (`grep` to verify.)
- Are the contracts complete, or do they hand-wave on cardinality / closure / mutability / identity?
- Is the rationale concrete (cites a founder reframe, a constraint, a prior bug) or generic ("for clarity")?
- Did the concept-doc update touch the right files? Are there other concept docs that need to mention this change?

Address critical issues. Max 1 round.

The concept is now **locked**. The downstream skills with the concept as fixed input — they explore *inside* the concept, never reshape it.

## Recap gate — post-lock founder confirm (interactive mode only)

**Canonical `PIPELINE_INTERACTIVE` rule** — interactive mode is on if and only if `PIPELINE_INTERACTIVE` is exactly the literal string `1`. Every other value — unset, empty, `0`, `true`, `yes`, anything else — is autonomous mode. This is the second authoritative copy of the rule (the first lives in `pipeline/SKILL.md`); `/concept` runs standalone upstream of the pipeline and must be self-contained.

**This section is NOT Phase 7.** It is named "Recap gate" to avoid colliding with the pipeline's canonical 6-phase axis. It fires at the END of the `/concept` flow — after Phase 6 (in-session self-critique) completes and the concept doc is written and committed (the "locked" moment) — and BEFORE `/concept` returns control to the founder, who only then invokes `/pipeline`. The pipeline does not run `/concept`; this gate is entirely upstream of the pipeline run.

### If not interactive (default)

When `PIPELINE_INTERACTIVE` is not exactly `1`: skip this section entirely. Write the concept doc, commit, and return — **no recap emitted, no `AskUserQuestion`, no bound to enforce.** This is the existing behavior made explicit.

### If interactive (`PIPELINE_INTERACTIVE` == `1`)

After the concept doc is locked (Phase 6 complete, doc committed):

**1. Emit the recap** — plain-language prose surfaced in chat, derived from the just-locked `concept.md`. The recap must contain three beats:

1. **What the noun IS** — one to two sentences in plain language (from the concept doc's Definition + essential properties).
2. **What the noun is NOT** — the rejection list, plainly stated (from the concept doc's "What it is not").
3. **What it commits to** — the contracts the concept locks (from the concept doc's Contracts section — cardinality, closure, mutability, identity, hard rules), stated as "this commits us to …".

**Multi-noun collapse rule.** If the concept introduces multiple nouns (as AJ2 itself does): lead with the central noun's three beats in full, then for each satellite noun emit exactly **one line** naming the noun + its single most load-bearing commitment (drawn from that noun's Contracts "Hard rules" field, or if none, its Definition). Cap satellite lines at the count of New/Reshaped nouns. Never emit a full three-beat block per satellite — that buries the decision the founder must make.

The recap is chat prose, never a new artifact file. It is a view of `concept.md`, not a parallel source of truth.

**2. Gate: single `AskUserQuestion` with two options:**

- **Confirm** — "The locked concept is right. Proceed." → `/concept` returns normally; the founder may now invoke `/pipeline`, which reads the confirmed concept as fixed input.
- **Redirect** — "The locked concept is wrong. Go back." → `/concept` **returns to concept work** (re-enters Phases 1–5 to produce a revised locked doc, seeded by the founder's free-text response in the `AskUserQuestion` reply — that response text is the redirect note, no new channel needed), then re-emits the recap + gate. It does NOT return control for the pipeline to proceed on the rejected concept.

**Bound (CRITICAL): cap at 3 redirect rounds.** After a 3rd redirect without a Confirm, mark the concept **`blocked: concept-contested`** (a chat verdict — not a progress-file write; `/concept` has no progress-JSON machinery) and stop. Do NOT return a "proceed" verdict. A `blocked: concept-contested` concept must not be handed to `/pipeline` — if the founder invokes `/pipeline` on it anyway, the pipeline's existing `concept-missing`/misalignment fail-fast applies. This bound mirrors the pipeline's universal max-3 loop discipline (`pipeline/SKILL.md` lines 234–237). Three rounds without confirm means the concept is contested; the founder retains the final say, but the loop terminates deterministically.

**What redirect does NOT do:** it does not hand-edit the recap or the concept doc inline. Redirect routes back into concept work, which produces a new locked doc. "Redirect" means "the locked concept is wrong, go back" — not "edit this line in the recap."

## Output of `/concept` end-to-end

```
plans/<workpackage-id>/concept.md           # Phase 5 per-workpackage concept-locking output (always)
docs/<topic>/<noun>.md                # Phase 5 ground-truth update (specific file, when applicable)
docs/<topic>/canonical-shapes.md      # Phase 5 may add a canonical-shapes entry
```

## What this skill does NOT do

- It does not design, define an architecture or write tests or code. That's `/design`, `/architecture`, `/write-tests`, `/write-code`.
- The recap (in "## Recap gate") is chat prose, never a new artifact file. No `recap.md` to write or commit.
- Redirect re-runs concept work; it does not hand-edit the locked doc or the recap text inline.
- The redirect loop is bounded at 3 rounds; after 3 without a Confirm, the concept is `blocked: concept-contested` — do not continue looping.
- `blocked: concept-contested` is a chat verdict, not a progress-file write. `/concept` has no progress-JSON machinery; the verdict gates whether the founder hands the concept to the pipeline.

Concepts are the part that is *expensive to change*; they ripple through every downstream variant in design and every contract in architecture. Get them right, then let design and architecture explore freely within them.

## Anti-patterns

- Skipping to design before defining the concept.
- Concept by code (the type is one expression of the concept, not the concept).
- Empty rejection list.
- Vibes-only definitions.
- Re-litigating the concept in `/design` or `/architecture`.
- Padding the probe list — ask only what's unsettled, then issue survivors as one batch, not seven separate round-trips.
- Writing the recap as a new artifact file. It lives in chat only.
- Emitting the recap in autonomous mode (when `PIPELINE_INTERACTIVE` is not exactly `1`). Autonomous mode: write doc, return — no recap, no gate.
- Continuing to redirect after 3 rounds. After the 3rd, stop with `blocked: concept-contested`.

## Target

$ARGUMENTS
