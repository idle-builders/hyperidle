---
name: refine
description: "Sharpen one workpackage's user requirement before design + architecture. Probe the noun, ask the user what value we're generating (the cheapest clarification point), and draft the user/dev guide that tells the story of what's being built. Run as the first pre-build act on any workpackage whose goal is unclear or that introduces/reshapes a load-bearing noun."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 18
---

# Refine — Sharpen the User Requirement

First of a workpackage's three pre-build acts: **refine → design → architecture** (together these are the workpackage's *concept*). Upstream of `/design` and `/architecture`. Answers "what value does this generate, and what IS the thing it generates?" — the layer where Thread is distinguished from Message, Block from Section, Artifact from Output, Bet from Task, Cost from Duration.

**Per-workpackage only.** The *strategic frame* of a whole worktrack — its boundary, primitive, and shared load-bearing nouns — is settled in `/work-planning` (its strategic-framing questionnaire) + `docs/<topic>/` ground truth, not here. `/refine` inherits that frame as a fixed input and must not contradict it; it sharpens this one workpackage's requirement. Output: `plans/<workpackage-id>/requirements.md` + any `docs/` ground-truth it reshapes.

**Why this is the cheapest clarification point.** Asking the user "what value are we generating here?" before any design or code is the cheapest place to catch a wrong requirement — caught here it costs a question; caught after build it costs the whole workpackage. The Phase 1 questionnaire is that lever.

**Skip when:** the requirement is already sharp and locked in `docs/` and the workpackage doesn't reshape it. Read the relevant section files first; if they answer Phase 1 without contradiction, skip.

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

**Refine the human-concept-review forecast (advisory).** Refine is where new nouns/components first surface, so it is the right place to *refine* the planning-time **Human concept review.** forecast field in the WP's track doc (`/work-planning` sets it initially). If Phase 0 classifies a noun as a **New primitive** or an essential / base component, refine that field to `Yes` in the track doc. Keep it advisory — this is a forecast, not the gate; the authoritative gate is `conceptReviewDecision(DESIGN-CLASS, DOC-CLASS)` at review time (a `Yes` forecast does not force review if the design is `routine` and the docs are not significantly rewritten; a `No` forecast does not suppress it if `/design` classifies `novel` or this skill emits `DOC-CLASS: significant`).

## Phase 1 — Probe the essence

For each New / Reshaped noun, walk the decision tree. Pick only the probes that are actually unsettled — skip the ones where the spec or existing concept docs already pin the answer. For each remaining probe, propose your read with the evidence you have, then ask the human (or in autonomous mode the reviewer) to confirm, override, or dig deeper. Issue all probes for a noun in one parallel batch — independent probes don't need separate round-trips, and the cost adds up across seven essentials × N nouns.

**Few, important questions.** Three sharp probes force a real decision; ten low-stakes ones get answered with shrugs while the load-bearing assumption stays silent and surfaces years later as a load-bearing bug. The bar to ask is: "will the answer change the requirement?" If no, don't ask.

**Lead with value (the cheapest question).** Before the noun probes, settle the requirement itself: **"What value does this workpackage generate, and for whom? My read: …"** This is the one question always worth asking the user when reachable — it is far cheaper to correct a misread requirement here than after design or build. If the answer reshapes scope, fix the requirement before probing the noun.

The seven essential probes (adapt; don't ask all of them — pick what's actually unsettled):

1. **Identity.** "What IS a `<noun>` in one sentence — what kind of thing is it (container? event? snapshot? relationship? capability?)? My read: …"
2. **Essential properties.** "What properties must every `<noun>` have for it to be a `<noun>` at all (vs accidental properties some have)? My read: …"
3. **Rejection list.** "What is a `<noun>` *not*? What adjacent thing is tempting to fold in but is actually a different concept? My read: `<noun>` is not X because Y."
4. **Composition.** "What other concepts does a `<noun>` carry, host, or attach to? My read: a `<noun>` attaches to {hosts}, carries {payload}, is referenced by {references}."
5. **Lifecycle.** "What states does a `<noun>` move through, and what causes each transition? My read: …"
6. **Authority.** "Who owns / produces / mutates a `<noun>`? Where does the source of truth live? My read: …"
7. **Vocabulary collision.** "Does `<noun>` clash with an existing term in any specific `docs/<topic>/<file>.md` (including canonical-shapes contracts)? Is it used inconsistently inside this same workpackage? My read: …"

Stop probing when the concept is sharp, not when you run out of questions. Three to seven branches is typical for a new primitive; one or two for a reshape.

If the founder is reachable, surface each probe with one AskUserQuestion (never batch). In autonomous mode, propose your answer in `requirements.md` and let `/architecture`'s in-session spec-alignment scoring catch it later if you got it wrong. Note: the per-probe `AskUserQuestion` branch here is the *probe-time* interaction; the *post-lock* recap gate (see "## Recap gate" below) is separate — it fires once, after lock, governed by the canonical `PIPELINE_INTERACTIVE` rule, not by per-probe reachability.

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

Format inline in `requirements.md`:

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
- **Closure contracts.** Is the type vocabulary closed (adding a new variant requires a requirements-doc update first) or open (callers extend freely)?
- **Mutability contracts.** Once created, what's immutable? What can change? Who can change it?
- **Identity contracts.** What gives a `<noun>` its identity — opaque ID, content hash, deterministic key?
- **Hard rules.** Anything that, if violated downstream, means the implementation has broken the concept. (TRACK-L L2 has one: "On-disk format stays GitHub-flavoured markdown. Blocks are derived, never stored.")

Each contract is one line. The designer later turns these into types, schemas, and guards in `/architecture` mode. Concept work commits to the *shape*, not the implementation.

## Phase 5 — Write the requirements doc (with the backwards-planned guide draft) and update ground truth

The output is a requirements doc, not a chat summary. **The file always belongs in the workpackage folder, inside the feature worktree** — never loose in the repo root or an ad-hoc path. Write to:
- `plans/<workpackage-id>/requirements.md` — the per-workpackage requirement output (always). `plans/` is tracked, so this file is committed with the run and persists across worktrees — it is what `/design` and `/architecture` read as a fixed input. It is later retired by `/write-docs` once its essence lives in the `docs/` ground truth below.
- A specific `docs/<topic>/<noun>.md` ground-truth file if the requirement reshapes an existing layer (Thread → `docs/human-interface-layer/threads.md`, Block → `docs/blocks/<file>.md`, Artifact → `docs/process-layer/artifacts.md`). Update or create the specific file — do not write to a generic folder.
- An update to the matching `docs/<topic>/canonical-shapes.md` (or sibling contract file) so downstream workpackages reference it without re-inventing.

**Plan backwards — draft the guide.** The clearest way to state a requirement is to write the user/dev documentation that explains what we're building, as if it shipped. Include in `requirements.md` a **Guide draft** section in the user/dev-guide voice (what the user will be able to do/see, or — for a dev-facing capability — how a developer will use it). This draft is the story the requirement tells; `/human-concept-review` reviews it, and `/write-docs` later reconciles it into `docs/` against the as-built reality.

**Emit the `DOC-CLASS` line.** At the top of `requirements.md`, emit one machine-greppable line forecasting how much this workpackage will rewrite the user/dev guides — the doc half of the human-concept-review gate (the design half is `/design`'s `DESIGN-CLASS`):

```
DOC-CLASS: significant|minor|none
```

`significant` = a new user/dev-guide page or a large rewrite of an existing one (the guide draft above is substantial and new). `minor` = small additions to an existing page. `none` = nothing a reader sees, reads, or does changes. `conceptReviewDecision(DESIGN-CLASS, DOC-CLASS)` runs human review when EITHER is high-stakes.

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

## Phase 6 — Challenge the requirement (in-session self-critique)

Switch to adversarial thinking. Challenge your own requirement — NOT the downstream design / plan:
- Is the value statement concrete (names who benefits and how), or generic?
- Is the rejection list a real list of distinct things, or three flavours of one thing?
- Does the canonical term collide with an existing term in the codebase or in any specific `docs/<topic>/<file>.md`? (`grep` to verify.)
- Are the contracts complete, or do they hand-wave on cardinality / closure / mutability / identity?
- Is the guide draft something a real user/dev could follow, or hand-wave?
- Did the ground-truth update touch the right files?

Address critical issues. Max 1 round.

The requirement is now **locked**. The downstream acts (`/design`, `/architecture`) take it as fixed input — they explore *inside* it, never reshape it.

## Recap gate — post-lock founder confirm (interactive mode only)

**Canonical `PIPELINE_INTERACTIVE` rule** — interactive mode is on if and only if `PIPELINE_INTERACTIVE` is exactly the literal string `1`. Every other value — unset, empty, `0`, `true`, `yes`, anything else — is autonomous mode. This is the second authoritative copy of the rule (the first lives in `pipeline/SKILL.md`); `/refine` may run standalone or as the pipeline's first pre-build act, so it must be self-contained.

**This section is NOT Phase 7.** It is named "Recap gate" to avoid colliding with the pipeline's phase axis. It fires at the END of the `/refine` flow — after Phase 6 (in-session self-critique) completes and `requirements.md` is written and committed (the "locked" moment) — and BEFORE `/refine` returns, so the founder confirms the requirement before design/architecture build on it.

### If not interactive (default)

When `PIPELINE_INTERACTIVE` is not exactly `1`: skip this section entirely. Write `requirements.md`, commit, and return — **no recap emitted, no `AskUserQuestion`, no bound to enforce.** This is the existing behavior made explicit.

### If interactive (`PIPELINE_INTERACTIVE` == `1`)

After the requirement is locked (Phase 6 complete, doc committed):

**1. Emit the recap** — plain-language prose surfaced in chat, derived from the just-locked `requirements.md`. The recap must contain three beats:

1. **What value this generates** — one to two sentences in plain language (from the value statement + guide draft).
2. **What the noun IS / is NOT** — the definition + the rejection list, plainly stated.
3. **What it commits to** — the contracts the requirement locks (cardinality, closure, mutability, identity, hard rules), stated as "this commits us to …".

**Multi-noun collapse rule.** If the requirement introduces multiple nouns: lead with the central noun's three beats in full, then for each satellite noun emit exactly **one line** naming the noun + its single most load-bearing commitment (drawn from that noun's Contracts "Hard rules" field, or if none, its Definition). Cap satellite lines at the count of New/Reshaped nouns. Never emit a full three-beat block per satellite — that buries the decision the founder must make.

The recap is chat prose, never a new artifact file. It is a view of `requirements.md`, not a parallel source of truth.

**2. Gate: single `AskUserQuestion` with two options:**

- **Confirm** — "The locked requirement is right. Proceed." → `/refine` returns normally; design + architecture read the confirmed requirement as fixed input.
- **Redirect** — "The locked requirement is wrong. Go back." → `/refine` **re-enters Phases 1–5** to produce a revised locked doc, seeded by the founder's free-text response in the `AskUserQuestion` reply (that response text is the redirect note, no new channel needed), then re-emits the recap + gate. It does NOT let design/architecture proceed on the rejected requirement.

**Bound (CRITICAL): cap at 3 redirect rounds.** After a 3rd redirect without a Confirm, mark the requirement **`blocked: requirement-contested`** (a chat verdict — not a progress-file write; `/refine` has no progress-JSON machinery) and stop. Do NOT return a "proceed" verdict. This bound mirrors the pipeline's universal max-3 loop discipline. Three rounds without confirm means the requirement is contested; the founder retains the final say, but the loop terminates deterministically.

**What redirect does NOT do:** it does not hand-edit the recap or `requirements.md` inline. Redirect re-runs refinement, which produces a new locked doc. "Redirect" means "the locked requirement is wrong, go back" — not "edit this line in the recap."

## Output of `/refine` end-to-end

```
plans/<workpackage-id>/requirements.md      # Phase 5 requirement output (always; carries the DOC-CLASS line + guide draft)
docs/<topic>/<noun>.md                # Phase 5 ground-truth update (specific file, when applicable)
docs/<topic>/canonical-shapes.md      # Phase 5 may add a canonical-shapes entry
```

## What this skill does NOT do

- It does not design, define an architecture or write tests or code. That's `/design`, `/architecture`, `/write-tests`, `/write-code`.
- The recap (in "## Recap gate") is chat prose, never a new artifact file. No `recap.md` to write or commit.
- Redirect re-runs refinement; it does not hand-edit the locked doc or the recap text inline.
- The redirect loop is bounded at 3 rounds; after 3 without a Confirm, the requirement is `blocked: requirement-contested` — do not continue looping.
- It does not settle the worktrack's strategic frame — that is `/work-planning`'s job.

Requirements are *expensive to change*; they ripple through every downstream variant in design and every contract in architecture. Get them right, then let design and architecture explore freely within them.

## Anti-patterns

- Skipping to design before sharpening the requirement.
- Skipping the value question when the user is reachable — it is the cheapest correction point.
- Requirement by code (the type is one expression of the requirement, not the requirement).
- Empty rejection list.
- Vibes-only definitions.
- Re-litigating the requirement in `/design` or `/architecture`.
- Padding the probe list — ask only what's unsettled, then issue survivors as one batch, not seven separate round-trips.
- Writing the recap as a new artifact file. It lives in chat only.
- Emitting the recap in autonomous mode (when `PIPELINE_INTERACTIVE` is not exactly `1`). Autonomous mode: write doc, return — no recap, no gate.
- Continuing to redirect after 3 rounds. After the 3rd, stop with `blocked: requirement-contested`.

## Target

$ARGUMENTS
