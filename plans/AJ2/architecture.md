# AJ2 Architecture — Interactive Pipeline Mode

**Scope:** Markdown-only changes to four skill files in `.claude/skills/`. No product code, no `/design`, no runtime. Strictly additive: the autonomous default is unchanged.

**Files edited (in dependency order):**
1. `.claude/skills/pipeline/SKILL.md` — define the mode signal, thread it, gate the two touchpoints into the phase descriptions.
2. `.claude/skills/concept/SKILL.md` — emit the concept recap + confirm/redirect gate when interactive.
3. `.claude/skills/ship/SKILL.md` — emit the ship summary before the human merge when interactive.
4. `.claude/skills/work-planning/SKILL.md` — one-line awareness note about interactive mode (no new spec field).

---

## 1. Mode signal — selection and threading

### Signal

**`PIPELINE_INTERACTIVE=1`** — an environment variable, mirroring the existing `PIPELINE_AB_MODE=1` precedent (`pipeline/SKILL.md` lines ~104, ~228).

- **Default (unset / any value ≠ `1`):** autonomous mode. Today's behavior, byte-for-byte. No touchpoints, no `AskUserQuestion`.
- **`PIPELINE_INTERACTIVE=1`:** interactive mode. The two touchpoints fire.

Why an env var (vs a `/pipeline` argument): the precedent already exists (`PIPELINE_AB_MODE`), the orchestrator already reads env at start, and an env var is the natural "founder sets it before invoking" opt-in. A positional argument would collide with the existing workpackage-ID argument grammar.

### Read-once-and-thread

- `/pipeline` reads `PIPELINE_INTERACTIVE` **once at run start** (same place it conceptually reads `PIPELINE_AB_MODE`), and records the mode for the run.
- The orchestrator threads the mode to exactly two dispatch sites:
  - **Phase 1 designer dispatch** → instructs the designer that after `/concept` locks, it must emit the concept recap and gate on the founder's confirm/redirect (only if interactive).
  - **Ship dispatch** → instructs the builder that after CI-green and before declaring ship done, it must emit the ship summary (only if interactive).
- Sub-skills (`/concept`, `/ship`) **also tolerate reading the env var directly** so they degrade safely if invoked standalone — but inside the pipeline the orchestrator's instruction is authoritative. The contract is: *absent signal ⇒ no touchpoint*, regardless of who reads it.

### A/B and cron stay autonomous

- **A/B mode** (`PIPELINE_AB_MODE=1`): orthogonal flag; it keeps the PR draft for replay. Interactive mode is independent — an A/B run does NOT set `PIPELINE_INTERACTIVE`, so A/B runs emit no touchpoints. The architecture explicitly states the two flags are independent and A/B never implies interactive.
- **Cron/autonomous path:** the scheduler invokes `/pipeline` without `PIPELINE_INTERACTIVE`, so it is autonomous by construction. It never blocks on a touchpoint.

---

## 2. Concept-recap content contract

### Fields (exact — the three beats)

The recap is plain-language prose surfaced in chat, derived from the just-locked `concept.md`. It must contain:

1. **What the noun IS** — one to two sentences in plain language (from the concept doc's **Definition** + essential properties).
2. **What the noun is NOT** — the rejection list, plainly stated (from the concept doc's **What it is not**).
3. **What it commits to** — the contracts the concept locks (from the concept doc's **Contracts** — cardinality, closure, mutability, identity, hard rules), stated as "this commits us to …".

For a multi-noun concept, the recap covers the central noun and names the satellite nouns in one line each. The recap is a *digest*, not a paste of the doc.

### Where it fires

After `/concept` **locks** — i.e. after Phase 6 (in-session self-critique) completes and the concept doc is written/committed — and **before** `/design`/`/architecture` proceed. The recap is the last thing `/concept` does in interactive mode.

### Confirm-vs-redirect (the gate)

A single **`AskUserQuestion`** with two options:

- **Confirm** — "The locked concept is right. Proceed." → `/concept` returns normally; the pipeline advances to `/design`/`/architecture`.
- **Redirect** — "The locked concept is wrong. Go back." → `/concept` **returns to concept work** (re-enters its probing/Phase-1–5 to produce a revised locked doc) and does **NOT** let downstream phases proceed on the rejected concept. The founder's redirect note (free text in the `AskUserQuestion` response) seeds the revision.

"Redirect" gates *progression*, not the recap text. It does not invite hand-editing the recap; it re-runs concept work.

### Autonomous behavior

When `PIPELINE_INTERACTIVE` is absent: `/concept` writes and commits the doc and returns — **no recap emitted, no `AskUserQuestion`**. This is the existing dormant-branch pattern (`concept/SKILL.md` line ~60: "In autonomous mode, propose your answer in the concept doc …") made explicit at the recap level.

---

## 3. Ship-summary content contract

### Fields (exact — the five beats)

The ship summary is readable chat prose, assembled from artifacts that already exist. It must contain:

1. **What shipped** — one-paragraph plain-English description of the change (sourced from the PR title/body + the workpackage outcome).
2. **Which ACs were covered** — the reviewer's AC table result (from Phase 4 `/review`'s AC-completeness audit).
3. **Which files changed** — the changed-file list (from `git diff --stat` against `origin/main` / the PR diff).
4. **Retro cost signal** — the cost signal the retro emitted (from `plans/<id>/retro.md`, Phase 6).
5. **Residual risk** — anything the founder should weigh before merging (from the retro's risk notes + reviewer findings that were accepted/deferred).

### Where it fires

After `/ship` confirms **CI-green** (ship step 7) and **before the human merge** (ship step 8). The summary is the briefing for the existing human-merge wait.

### Merge still waits for the human

`/ship`'s merge stance is unchanged: it stops at "CI-green PR open" and the human runs `gh pr merge`. The summary precedes that decision and informs it; it emits **no `AskUserQuestion` gate of its own** (the human-merge decision is already the gate). This is the deliberate asymmetry with the concept recap: the recap adds a *new* go/no-go gate because none existed at concept-lock; the ship summary adds *briefing* to a gate that already exists (the human merge).

### Distinct from raw CI pass/fail

The summary is explicitly more than `gh pr checks` green. CI-green is the gate; the summary is the human-readable account of *what* passed. A summary that merely echoes "CI green" fails the contract — the five beats are mandatory.

### Autonomous behavior

When `PIPELINE_INTERACTIVE` is absent: `/ship` reaches CI-green and stops with **no summary, no founder prompt** (A/B keeps the PR draft for replay; non-A/B autonomous flips ready per existing rules). Committed artifacts and merge stance are unchanged.

---

## 4. Exact file/section edits

### 4a. `.claude/skills/pipeline/SKILL.md`

- **New section "## Run modes" (insert after the "## Pre-condition" section, before "## For each story …").** Define `PIPELINE_INTERACTIVE=1` (default off = autonomous), state it is read once at run start, name the two touchpoints it governs, and the orthogonality with `PIPELINE_AB_MODE` (A/B stays autonomous; cron stays autonomous; the two flags are independent). State the hard rule: interactive mode never alters the committed artifact set or phase order/persona separation/ship gate.
- **Edit the preamble (lines ~13–15, "You are autonomous. There is NO human…").** Add one qualifying clause: this autonomous stance is the **default**; when `PIPELINE_INTERACTIVE=1`, the run additionally surfaces the two founder touchpoints defined in "## Run modes" — and *only* those two, *only* in interactive mode. The default-off autonomous stance is unchanged.
- **Edit the Phase 1 designer dispatch block (the `Phase 1 — designer (production):` pseudo-block, lines ~134–142).** After "Run /concept …", add a mode-gated line: *"If `PIPELINE_INTERACTIVE=1`: after `/concept` locks, the designer emits the concept recap and gates on the founder's confirm/redirect (`AskUserQuestion`) before `/design`/`/architecture` proceed. On 'redirect', return to concept work; do not proceed. In autonomous mode this step is absent."*
- **Edit the Ship dispatch block (the `Ship (after retro …)` pseudo-block, lines ~218–229) and the "### Ship (after retro)" prose (lines ~93–106).** Add a mode-gated line: *"If `PIPELINE_INTERACTIVE=1`: after `/ship` reaches CI-green and before the human merges, the builder emits the ship summary (five beats). The merge still waits for the human. In autonomous mode this step is absent; CI-green-before-merge is unchanged."*
- **Edit the "## Why this is structured this way" section** — add a short subsection "### Why interactive mode is strictly additive (AJ2)" explaining the default-off stance and the never-alter-committed-artifacts guarantee, so future agents don't re-litigate.
- **Phase table (lines ~112–121):** leave the six phases and order untouched. Optionally add a parenthetical to the Phase-1 and ship rows noting "(+ founder touchpoint in interactive mode)" — additive annotation only, no structural change.

### 4b. `.claude/skills/concept/SKILL.md`

- **New section "## Phase 7 — Concept recap (interactive mode only)" inserted after "## Phase 6 — Challenge the concept …" and before "## Output of `/concept` end-to-end".** Specify: read `PIPELINE_INTERACTIVE`; if absent, skip entirely (write doc, return — unchanged). If `=1`, emit the recap (three beats: is / is-not / commits-to, drawn from the Phase 5 doc fields) as chat prose, then a single `AskUserQuestion` with Confirm/Redirect. Confirm → return normally. Redirect → re-enter concept work (Phases 1–5) with the founder's note, produce a revised locked doc, do NOT proceed downstream.
- **Edit the Phase 1 note (line ~60, "If the founder is reachable, surface each probe …").** Add a cross-reference: the per-probe `AskUserQuestion` branch is the *probe-time* interaction; the *post-lock* recap gate is Phase 7. They are distinct — the recap fires once, after lock, governed by `PIPELINE_INTERACTIVE`, not by per-probe reachability.
- **Edit "## What this skill does NOT do" / anti-patterns** — add: the recap is chat prose, never a new artifact file; redirect re-runs concept work, it does not hand-edit the locked doc.

### 4c. `.claude/skills/ship/SKILL.md`

- **New section "### 7a. Ship summary (interactive mode only)" inserted between step 7 (Wait for CI green) and step 8 (Merge decision).** Specify: read `PIPELINE_INTERACTIVE`; if absent, skip (proceed to step 8 unchanged). If `=1`, after CI-green emit the ship summary (five beats: what shipped / ACs covered / files changed / retro cost signal / residual risk), sourced from PR body, reviewer AC table, `git diff --stat`, and `plans/<id>/retro.md`. Emit as chat prose; **no `AskUserQuestion`** — the human-merge decision (step 8) is the gate. State explicitly: distinct from raw CI pass/fail; the merge still waits for the human.
- **Edit step 8 ("Merge decision")** — add one sentence: in interactive mode the founder reads the ship summary (7a) before deciding; the merge stance is otherwise unchanged.
- **Edit "## Rules"** — add: "Never auto-merge — the ship summary briefs the human, it does not merge for them." (reinforces existing "Never merge" rule with the AJ2 context).

### 4d. `.claude/skills/work-planning/SKILL.md`

- **One-line awareness note only.** In the "## After registration" section (or a short new "## Note — running interactively" line near the end), add: *"The founder can run the pipeline in interactive mode (`PIPELINE_INTERACTIVE=1`) when they intend to steer — it surfaces a concept recap after `/concept` and a ship summary before merge (AJ2). This is a run-time opt-in, not a spec field."*
- **No new spec-template field.** The planning-time *human-design-review forecast* field is AJ3 scope, not AJ2. This edit must NOT add a forecast field, a new section, or a gate to the work-package template — it is a pointer only. (Explicit guard so the builder doesn't leak AJ3 scope into AJ2.)

---

## 5. Autonomous-parity guarantee — how it is proven

This is markdown-only with **no runtime code to unit-test** (per CLAUDE.md, tests assert on imported runtime behavior; these skill files are prompt instructions, not importable code). State this plainly so the reviewer and builder do not invent fake tests (e.g. `readFileSync`-grep "tests", which CLAUDE.md explicitly forbids — that is a lint rule, not a test).

The parity guarantee is proven by two honest methods:

**(a) Structural assertion — touchpoints are mode-gated and absent by default.** Every touchpoint instruction added in §4 is wrapped in an explicit `If PIPELINE_INTERACTIVE=1:` condition with a stated "in autonomous mode this step is absent" clause. The structural property to verify (by reading the diff, not by a runtime test): *no touchpoint instruction exists outside a `PIPELINE_INTERACTIVE=1` guard.* Concretely:
- The pipeline preamble's autonomous stance still reads as the default.
- Each of the two touchpoint blocks (concept recap, ship summary) is reachable only under the `=1` guard.
- No phase was reordered, no persona boundary changed, no committed-artifact instruction added/removed (the continuous-commit table in `pipeline/SKILL.md` is untouched — same files, same `[skip ci]` flags, same CI gate).
This is enforced at review by the reviewer reading the diff against this contract — it is a documentation-structure check, the appropriate validation for a markdown change, not a runtime test.

**(b) Founder walkthrough of a real run** (the track-wide proof bar, TRACK-AJ intro line 7 / AJ2 plan-calls line 84):
- **Interactive pass:** invoke the pipeline with `PIPELINE_INTERACTIVE=1` on a concept-introducing workpackage; observe the concept recap with confirm/redirect after `/concept`, and the ship summary before merge. Confirm "redirect" returns to concept work; confirm the merge still waits for the human.
- **Autonomous-parity pass:** invoke the same pipeline without `PIPELINE_INTERACTIVE`; observe **no founder prompt is emitted** and the **committed artifact set matches pre-change behavior** (same files, same commits modulo content). This is validation scenario 3 in the spec (line ~82).

**What is explicitly NOT a valid proof:** a `readFileSync`/grep "test" asserting the skill files contain certain strings (forbidden by CLAUDE.md — that is a lint rule, not a test); a runtime unit test (there is no importable runtime); any check that changes production behavior to pass. The reviewer should accept the structural diff-read + founder walkthrough as the definition of done for this markdown-only WP, and reject any invented runtime test as scope-inflation.

---

## Edit ordering (for the builder)

1. `pipeline/SKILL.md` — establish the mode signal + "## Run modes" + the two gated dispatch lines (this is the source of truth the other three reference).
2. `concept/SKILL.md` — add Phase 7 recap (references the signal from step 1).
3. `ship/SKILL.md` — add step 7a summary (references the signal from step 1).
4. `work-planning/SKILL.md` — one-line awareness note.

Each is `[skip ci]` (markdown-only, no code paths). All four in one logical commit per the WP, or two commits (pipeline+concept, ship+work-planning) — builder's choice; one commit is cleaner for this small additive change.

## Out of scope (guards against scope creep)

- No new artifact files (`recap.md`, `ship-summary.md`) — chat prose only.
- No presence check / parking — AJ3's stakes gate is separate.
- No `/work-planning` forecast field — AJ3 scope.
- No change to autonomous decision-making, phase order, persona separation, the ship gate, or CI behavior.
- No `PIPELINE_AB_MODE` change — orthogonal; documented as independent.
