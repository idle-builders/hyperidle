# AJ2 Architecture — Interactive Pipeline Mode

**Scope:** Markdown-only changes to four skill files in `.claude/skills/`. No product code, no `/design`, no runtime. Strictly additive: the autonomous default is unchanged.

**Where each touchpoint lives — the load-bearing reconciliation (CRITICAL-1).** The pipeline does **NOT** run `/concept` — `pipeline/SKILL.md` lines 42–46 state concept-locking is *upstream founder work*; the pipeline reads the locked concept as fixed input and fails fast (`blocked: concept-missing`) if it's absent. Therefore the **concept recap + confirm/redirect gate is NOT a pipeline phase.** It lives **inside `/concept` itself** and fires when the founder runs `/concept <id>` interactively, BEFORE the locked concept is ever handed to the pipeline. The pipeline never sees, owns, or re-runs the recap. The **ship summary**, by contrast, IS owned by the pipeline, because `/ship` *is* a pipeline phase. This split is the spine of the whole plan: one touchpoint is upstream-of-pipeline (recap, in `/concept`), one is in-pipeline (summary, in `/ship`). The AJ2 AC — "after a concept is locked in interactive mode, founder shown recap, can confirm or send back before design/architecture proceed" — is satisfied entirely within the upstream `/concept` run, before the founder ever invokes `/pipeline`.

**Files edited (in dependency order):**
1. `.claude/skills/concept/SKILL.md` — define the canonical mode rule (or own a local copy referencing it), emit the concept recap + bounded confirm/redirect gate at the END of `/concept` when interactive. **This is the recap's home.**
2. `.claude/skills/ship/SKILL.md` — emit the ship summary before the human merge when interactive (a pipeline-owned touchpoint, since `/ship` is a pipeline phase).
3. `.claude/skills/pipeline/SKILL.md` — define the canonical mode rule + the run-mode concept; thread interactive mode ONLY to the ship touchpoint. **No Phase-1 recap dispatch** — the pipeline does not run `/concept` and does not own the recap.
4. `.claude/skills/work-planning/SKILL.md` — one-line awareness note about interactive mode (no new spec field).

---

## 1. Mode signal — selection and threading

### Signal

**`PIPELINE_INTERACTIVE`** — an environment variable, mirroring the existing `PIPELINE_AB_MODE=1` precedent (`pipeline/SKILL.md` lines ~104, ~228).

**THE CANONICAL TRUTHINESS RULE (WARNING-3) — stated ONCE, here, referenced everywhere.**

> **Interactive mode is on if and only if `PIPELINE_INTERACTIVE` is exactly the literal string `1`. Every other value — unset, empty, `0`, `true`, `yes`, anything else — is autonomous mode.**

This is the single source of truth. Every skill that reads the signal (`/concept`, `/ship`, `/pipeline`) **references this rule by name — "the canonical `PIPELINE_INTERACTIVE` rule (== `1`)"** — and never restates its own truthiness check. The rule is written verbatim once in `pipeline/SKILL.md`'s new "## Run modes" section and once in `concept/SKILL.md` (because `/concept` runs upstream-of-pipeline and must be self-contained when invoked standalone); `ship/SKILL.md` and `work-planning/SKILL.md` point at it rather than re-derive it. Two verbatim copies (pipeline + concept) is deliberate — `/concept` is the upstream-standalone home of the recap and cannot depend on the pipeline's section existing in its context — but both copies are byte-identical, so no drift is possible. Any future skill adding a touchpoint must reference, not re-derive.

- **Autonomous (default, value ≠ `1`):** today's behavior, byte-for-byte. No touchpoints, no `AskUserQuestion`.
- **Interactive (value == `1`):** the touchpoints fire (recap in `/concept`; ship summary in `/ship`).

Why an env var (vs a `/pipeline` argument): the precedent already exists (`PIPELINE_AB_MODE`), the orchestrator already reads env at start, and an env var is the natural "founder sets it before invoking" opt-in that also survives into the upstream `/concept` run. A positional argument would collide with the existing workpackage-ID argument grammar AND would not be visible to the upstream standalone `/concept` invocation.

### Read-once-and-thread (CRITICAL-1: recap is NOT threaded — it is upstream)

Two touchpoints, two different ownership homes:

- **Concept recap — upstream of the pipeline, owned by `/concept`.** The founder runs `/concept <id>` standalone *before* invoking `/pipeline`. `/concept` reads `PIPELINE_INTERACTIVE` itself (per the canonical rule) and, when interactive, emits the recap + bounded gate at the END of its own flow — see §4b. **The pipeline never threads this, never dispatches it, never re-runs it.** By the time `/pipeline` starts, the concept is already locked-and-confirmed (or marked `blocked: concept-contested`); the pipeline reads it as fixed input exactly as it does today. There is **no Phase-1 recap dispatch.**
- **Ship summary — in-pipeline, threaded by the orchestrator.** `/pipeline` reads `PIPELINE_INTERACTIVE` **once at run start** (same place it conceptually reads `PIPELINE_AB_MODE`), records the mode, and threads it to exactly **one** dispatch site: the **ship dispatch** → instructs the builder that after CI-green and before declaring ship done, it emits the ship summary (only if interactive). `/ship` also reads the env var directly per the canonical rule so it degrades safely if invoked standalone; inside the pipeline the orchestrator's threaded instruction is authoritative. The contract: *absent signal ⇒ no touchpoint*, regardless of who reads it.

This split honors the pipeline pre-condition (lines 42–46: "the pipeline does NOT run `/concept`") without amending it — the recap simply lives where `/concept` already runs.

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

**Multi-noun collapse rule (WARNING-2).** `/concept`'s Phase 5 doc structure (`concept/SKILL.md` lines 109–131) has ONE Definition / "What it is not" / Contracts block per noun, and a concept may introduce several nouns (AJ2 itself has three). The recap is a digest, not a paste, so it collapses as follows: **lead with the central noun's three beats in full**, then for each satellite noun emit exactly **one line** naming the noun + its single most load-bearing commitment (drawn from that noun's Contracts "Hard rule", or if none, its Definition). Cap the satellite lines at the count of New/Reshaped nouns. Never emit a full three-beat block per satellite — that is a paste, not a digest, and buries the decision the founder must make.

### Where it fires (inside `/concept`, NOT in the pipeline — CRITICAL-1)

At the **END of the `/concept` flow** — after Phase 6 (in-session self-critique) completes and the concept doc is written/committed (the "locked" moment) — and **before `/concept` returns control to the founder**, who only *then* invokes `/pipeline`. The recap is the last thing `/concept` does in interactive mode. It is reached during the upstream, standalone `/concept` run; the pipeline is not running at this point.

### Confirm-vs-redirect (the gate)

A single **`AskUserQuestion`** with two options:

- **Confirm** — "The locked concept is right. Proceed." → `/concept` returns normally; the founder may now invoke `/pipeline`, which reads the confirmed concept as fixed input.
- **Redirect** — "The locked concept is wrong. Go back." → `/concept` **returns to concept work** (re-enters its probing/Phases 1–5 to produce a revised locked doc), then re-emits the recap + gate. It does **NOT** return control for the pipeline to proceed on the rejected concept. The founder's redirect note (free text in the `AskUserQuestion` response — this is the existing `AskUserQuestion` response channel, no new plumbing) seeds the revision.

"Redirect" gates *progression*, not the recap text. It does not invite hand-editing the recap; it re-runs concept work.

### Bounded redirect loop (CRITICAL-2 — max 3 rounds)

The redirect→re-probe→recap→redirect cycle is **capped at 3 redirect rounds**, mirroring every other pipeline loop (`pipeline/SKILL.md` lines 234–237; ship line 117). **After the 3rd redirect without a Confirm, `/concept` stops: it marks the concept `blocked: concept-contested`** (a new blocked-reason, sibling to the pipeline's `concept-or-spec-misalignment` at line 237) and does **NOT** return a "proceed" verdict. A `blocked: concept-contested` concept must not be handed to `/pipeline` — if the founder later invokes `/pipeline` on it anyway, the pipeline's existing `concept-missing`/misalignment fail-fast applies. This bound exists because an unbounded human-gated loop is a hole in the concept's own closure contract; 3 rounds is the universal pipeline cap. The founder retains the final say (they chose to redirect), but the loop terminates deterministically.

### Autonomous behavior

When `PIPELINE_INTERACTIVE` is not exactly `1` (the canonical rule): `/concept` writes and commits the doc and returns — **no recap emitted, no `AskUserQuestion`, no bound to enforce**. This is the existing dormant-branch pattern (`concept/SKILL.md` line ~60: "In autonomous mode, propose your answer in the concept doc …") made explicit at the recap level.

---

## 3. Ship-summary content contract

### Fields (exact — the five beats)

The ship summary is readable chat prose, assembled from artifacts that already exist. It must contain:

1. **What shipped** — one-paragraph plain-English description of the change (sourced from the PR title/body + the workpackage outcome).
2. **Which ACs were covered** — the reviewer's AC table result (from Phase 4 `/review`'s AC-completeness audit).
3. **Which files changed** — the changed-file list (from `git diff --stat` against `origin/main` / the PR diff).
4. **Retro cost signal** — the cost signal the retro emitted (from `plans/<id>/retro.md`, Phase 6).
5. **Residual risk** — anything the founder should weigh before merging (from the retro's risk notes + reviewer findings that were accepted/deferred).

### No-fabricate fallback rule (WARNING-2)

The `/retro` template does **not** contractually guarantee a named "cost signal" or "residual risk" field, and a given run's reviewer output may not enumerate deferred findings. The summary must therefore **never invent** these. For every beat, if its source field is absent or empty:

- **Beat 4 (retro cost signal):** if `retro.md` carries no explicit cost signal, state **"cost signal: not recorded"** — do not estimate, infer, or fabricate a number.
- **Beat 5 (residual risk):** if neither the retro nor the accepted/deferred reviewer findings name a residual risk, state **"residual risk: none recorded"** — do not manufacture a risk to fill the slot.
- **Beats 1–3 (what shipped / ACs / files):** these source from the PR body, the reviewer AC table, and `git diff --stat`, which always exist by ship time; if the AC table is somehow missing, state **"AC coverage: not available — see PR review"** rather than asserting coverage.

The rule is one line in the skill: *a beat with no source says "not recorded," never a guess.* A fabricated cost number or invented risk is worse than an honest "not recorded" — it misleads the merge decision the summary exists to inform.

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

The pipeline owns **only** the ship-summary touchpoint and the run-mode definition. It does **NOT** own the recap (CRITICAL-1: the pipeline does not run `/concept`).

- **New section "## Run modes" (insert after the "## Pre-condition" section, before "## For each story …").** Write the **canonical `PIPELINE_INTERACTIVE` rule verbatim** (interactive iff value == `1`; everything else autonomous — §1). State it is read once at run start. Name the **one** touchpoint the pipeline governs: the **ship summary** (before the human merge). State explicitly: *the concept recap is NOT a pipeline touchpoint — it lives in `/concept`, which the founder runs upstream before invoking the pipeline (see the "## Pre-condition" section: the pipeline does not run `/concept`).* State orthogonality with `PIPELINE_AB_MODE` (A/B stays autonomous; cron stays autonomous; the two flags are independent). State the hard rule: interactive mode never alters the committed artifact set or phase order/persona separation/ship gate.
- **Edit the preamble (lines ~13–15, "You are autonomous. There is NO human…").** Add one qualifying clause: this autonomous stance is the **default**; when `PIPELINE_INTERACTIVE` is exactly `1`, the run additionally surfaces the **ship-summary** founder touchpoint defined in "## Run modes" — and *only* that, *only* in interactive mode. The default-off autonomous stance is unchanged. (The concept recap is upstream founder work in `/concept`, not a pipeline behavior.)
- **DO NOT edit the Phase 1 designer dispatch block for a recap.** There is no Phase-1 recap dispatch — the pipeline does not run `/concept` and the locked concept is already confirmed (or `blocked: concept-contested`) by the time the pipeline starts. The Phase-1 block (lines ~134–142) is left as-is. *(This is the explicit reversal of the prior plan's CRITICAL-1 error.)*
- **Edit the Ship dispatch block (the `Ship (after retro …)` pseudo-block, lines ~218–229) and the "### Ship (after retro)" prose (lines ~93–106).** Add a mode-gated line referencing the canonical rule: *"If `PIPELINE_INTERACTIVE` is `1` (canonical rule): after `/ship` reaches CI-green and before the human merges, the builder emits the ship summary (five beats; no-fabricate fallback applies). The merge still waits for the human. In autonomous mode this step is absent; CI-green-before-merge is unchanged."*
- **Edit the "## Why this is structured this way" section** — add a short subsection "### Why interactive mode is strictly additive (AJ2)" explaining the default-off stance, the never-alter-committed-artifacts guarantee, and **why the recap lives in `/concept` not the pipeline** (the pipeline does not run `/concept`), so future agents don't re-litigate.
- **Phase table (lines ~112–121):** leave the six phases and order untouched. Optionally add a parenthetical to the ship row only noting "(+ ship summary in interactive mode)" — additive annotation. **Do NOT annotate the Phase-1 row with a recap** — the recap is not a pipeline phase.

### 4b. `.claude/skills/concept/SKILL.md` — THE RECAP'S HOME (CRITICAL-1)

This is where the concept recap + confirm/redirect gate lives, because `/concept` is run by the founder upstream of the pipeline. The recap is the last act of an interactive `/concept` run, before control returns to the founder (who then invokes `/pipeline`).

- **New section "## Recap gate — post-lock founder confirm (interactive mode only)" inserted after "## Phase 6 — Challenge the concept …" and before "## Output of `/concept` end-to-end".** *(Named "Recap gate," not "Phase 7" — NTH-1: avoid colliding with the pipeline's canonical 6-phase axis.)* Specify:
  - Write the **canonical `PIPELINE_INTERACTIVE` rule verbatim** (interactive iff value == `1`; everything else autonomous — §1). This is the second authoritative copy of the rule (the first is in `pipeline/SKILL.md`); `/concept` runs standalone upstream so it must be self-contained.
  - If not interactive: skip entirely (write doc, return — unchanged).
  - If interactive: emit the recap (three beats: is / is-not / commits-to, drawn from the Phase 5 doc fields), applying the **multi-noun collapse rule** (§2: central noun's three beats in full; each satellite noun one line). Then a single `AskUserQuestion` with Confirm/Redirect.
  - **Confirm** → return normally; the founder may now invoke `/pipeline`.
  - **Redirect** → re-enter concept work (Phases 1–5) seeded by the founder's free-text `AskUserQuestion` response, produce a revised locked doc, re-emit the recap + gate.
  - **Bound (CRITICAL-2):** cap at **3 redirect rounds**. After the 3rd redirect without a Confirm, mark the concept **`blocked: concept-contested`** and stop — do NOT return a "proceed" verdict. State this bound inline, mirroring the pipeline's universal max-3 loop discipline.
- **Edit the Phase 1 note (line ~60, "If the founder is reachable, surface each probe …").** Add a cross-reference: the per-probe `AskUserQuestion` branch is the *probe-time* interaction; the *post-lock* recap gate is the new "Recap gate" section. They are distinct — the recap fires once, after lock, governed by the canonical `PIPELINE_INTERACTIVE` rule, not by per-probe reachability.
- **Edit "## What this skill does NOT do" / anti-patterns** — add: the recap is chat prose, never a new artifact file; redirect re-runs concept work, it does not hand-edit the locked doc; the redirect loop is bounded at 3 (then `blocked: concept-contested`).

### 4c. `.claude/skills/ship/SKILL.md`

- **New section "### 7a. Ship summary (interactive mode only)" inserted between step 7 (Wait for CI green) and step 8 (Merge decision).** Specify: read `PIPELINE_INTERACTIVE` per **the canonical rule** (reference it — interactive iff == `1`; the rule's verbatim text lives in `pipeline/SKILL.md` / `concept/SKILL.md`, do not restate the truthiness check here). If not interactive: skip (proceed to step 8 unchanged). If interactive: after CI-green emit the ship summary (five beats: what shipped / ACs covered / files changed / retro cost signal / residual risk), sourced from PR body, reviewer AC table, `git diff --stat`, and `plans/<id>/retro.md`, **applying the no-fabricate fallback (§3): any beat with no source says "not recorded," never a guess.** Emit as chat prose; **no `AskUserQuestion`** — the human-merge decision (step 8) is the gate. State explicitly: distinct from raw CI pass/fail; the merge still waits for the human.
- **Edit step 8 ("Merge decision")** — add one sentence: in interactive mode the founder reads the ship summary (7a) before deciding; the merge stance is otherwise unchanged.
- **Edit "## Rules"** — add: "Never auto-merge — the ship summary briefs the human, it does not merge for them." (reinforces existing "Never merge" rule with the AJ2 context).

### 4d. `.claude/skills/work-planning/SKILL.md`

- **One-line awareness note only.** In the "## After registration" section (or a short new "## Note — running interactively" line near the end), add: *"The founder can run interactive mode (`PIPELINE_INTERACTIVE=1`, the canonical rule defined in `pipeline/SKILL.md`) when they intend to steer — `/concept` surfaces a post-lock recap with a confirm/redirect gate (run upstream, before the pipeline), and `/ship` surfaces a ship summary before merge (AJ2). This is a run-time opt-in, not a spec field."* Note the recap is a `/concept` behavior, not a pipeline phase.
- **No new spec-template field.** The planning-time *human-design-review forecast* field is AJ3 scope, not AJ2. This edit must NOT add a forecast field, a new section, or a gate to the work-package template — it is a pointer only. (Explicit guard so the builder doesn't leak AJ3 scope into AJ2.)

---

## 5. Autonomous-parity guarantee — how it is proven

This is markdown-only with **no runtime code to unit-test** (per CLAUDE.md, tests assert on imported runtime behavior; these skill files are prompt instructions, not importable code). State this plainly so the reviewer and builder do not invent fake tests (e.g. `readFileSync`-grep "tests", which CLAUDE.md explicitly forbids — that is a lint rule, not a test).

The parity guarantee is proven by two honest methods:

**(a) Named structural parity guard — the touchpoint-gating invariant (WARNING-1).** There IS one legitimate, CLAUDE.md-compliant mechanical check here, and it must be named rather than dismissed alongside fake tests. CLAUDE.md is explicit: *static codebase properties belong to a lint rule / structural assertion, not a runtime test.* The invariant:

> **No touchpoint instruction (recap, ship summary, or any `AskUserQuestion` added by AJ2) appears outside a `PIPELINE_INTERACTIVE`-gated branch in the four edited skill files.**

This is a **static structural review-checklist assertion**, NOT a `readFileSync`/grep masquerading as a test (which CLAUDE.md forbids). It is enforced as a **named, repeatable reviewer-diff checklist item**: when reviewing the AJ2 diff, assert, for each of the four files, that every line introducing a recap beat, a ship-summary beat, or an `AskUserQuestion` sits under an explicit "if `PIPELINE_INTERACTIVE` == `1`" guard (referencing the canonical rule), and carries a stated "in autonomous mode this step is absent" clause. Markdown skill files are prompt instructions, not importable runtime, so the correct enforcement tool is the structured reviewer checklist (the static-property tool for a docs change), not a runtime test and not a lint plugin over prose (no design-lint rule parses skill-file English). Concretely the checklist verifies:
- The pipeline preamble's autonomous stance still reads as the default.
- Each touchpoint block (recap in `concept/SKILL.md`; ship summary in `ship/SKILL.md`) is reachable only under the canonical `== 1` guard.
- **No recap instruction was added to `pipeline/SKILL.md`** (CRITICAL-1: the pipeline does not own the recap).
- No phase was reordered, no persona boundary changed, no committed-artifact instruction added/removed (the continuous-commit table in `pipeline/SKILL.md` is untouched — same files, same `[skip ci]` flags, same CI gate).

This named checklist is the structural parity verification method, run **alongside** the founder walkthrough below — neither replaces the other.

**(b) Founder walkthrough of a real run** (the track-wide proof bar, TRACK-AJ intro line 7 / AJ2 plan-calls line 84):
- **Interactive pass:** invoke the pipeline with `PIPELINE_INTERACTIVE=1` on a concept-introducing workpackage; observe the concept recap with confirm/redirect after `/concept`, and the ship summary before merge. Confirm "redirect" returns to concept work; confirm the merge still waits for the human.
- **Autonomous-parity pass:** invoke the same pipeline without `PIPELINE_INTERACTIVE`; observe **no founder prompt is emitted** and the **committed artifact set matches pre-change behavior** (same files, same commits modulo content). This is validation scenario 3 in the spec (line ~82).

**What is explicitly NOT a valid proof:** a `readFileSync`/grep "test" asserting the skill files contain certain strings (forbidden by CLAUDE.md — that is a lint rule, not a test); a runtime unit test (there is no importable runtime); any check that changes production behavior to pass. The reviewer should accept the structural diff-read + founder walkthrough as the definition of done for this markdown-only WP, and reject any invented runtime test as scope-inflation.

---

## Edit ordering (for the builder)

1. `pipeline/SKILL.md` — write the **canonical `PIPELINE_INTERACTIVE` rule** verbatim in "## Run modes" + the ship-only gated dispatch line. **No recap dispatch.** This is the primary home of the canonical rule.
2. `concept/SKILL.md` — write the second verbatim copy of the canonical rule + the "Recap gate" section (bounded at 3 → `concept-contested`). This is the recap's home (runs upstream of the pipeline).
3. `ship/SKILL.md` — add step 7a summary, *referencing* the canonical rule (no restated truthiness), with the no-fabricate fallback.
4. `work-planning/SKILL.md` — one-line awareness note referencing the canonical rule.

Each is `[skip ci]` (markdown-only, no code paths). All four in one logical commit per the WP, or two commits (pipeline+concept establish the rule + recap; ship+work-planning reference it) — builder's choice; one commit is cleaner for this small additive change.

## Out of scope (guards against scope creep)

- No new artifact files (`recap.md`, `ship-summary.md`) — chat prose only.
- No presence check / parking — AJ3's stakes gate is separate.
- No `/work-planning` forecast field — AJ3 scope.
- No change to autonomous decision-making, phase order, persona separation, the ship gate, or CI behavior.
- No `PIPELINE_AB_MODE` change — orthogonal; documented as independent.
