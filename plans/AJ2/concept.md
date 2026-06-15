# AJ2 Concept — Interactive Pipeline Mode

**Level:** Per-workpackage concept (process nouns, not product primitives).

This workpackage introduces no product primitive. It introduces three load-bearing **process nouns** that govern how the build pipeline behaves when the founder is present: **interactive mode**, the **concept recap**, and the **ship summary**. Each is probed below. The governing constraint behind all three: autonomous mode is the default, and interactive touchpoints are strictly additive — they surface information and gate on a human choice when present, but never change what gets committed.

## Required reading (for `/architecture`, builder)

- `.pipeline/work-packages/TRACK-AJ.md` — the `AJ2 —` section + the track intro (autonomous-vs-interactive framing, AJ2's strictly-additive contract, and the AJ3 stakes-vs-presence distinction that AJ2 must NOT pre-empt).
- `.claude/skills/pipeline/SKILL.md` — the orchestrator; `PIPELINE_AB_MODE=1` env-var precedent (lines ~104, ~228); the 6-phase table; the worktree/draft-PR setup; the autonomous stance preamble.
- `.claude/skills/concept/SKILL.md` — Phase 1's dormant "if the founder is reachable, surface each probe with one `AskUserQuestion`" branch (line ~60); the Phase 5 doc-structure fields the recap draws from.
- `.claude/skills/ship/SKILL.md` — ends at CI-green PR (step 7), explicitly leaves merge to the human (step 8), emits no summary today.
- `.claude/skills/work-planning/SKILL.md` — founder-only; the AJ2 plan-calls name it in scope (planning-time advisory only — see note below).
- `CLAUDE.md` ABSOLUTE RULES — the autonomous stance that must remain the default when interactive mode is off.

---

## Noun 1 — Interactive mode

**Classification:** New process concept (a mode the pipeline can run in). Not a product primitive; it is a behavior switch on the orchestrator.

**Identity.** Interactive mode is an **opt-in run mode of `/pipeline`** that adds founder touchpoints at the two expensive-to-get-wrong moments (after `/concept` locks, before the human merge). It is a single boolean signal read once at the start of a pipeline run. It is a *mode of running*, not a new phase, not a new persona, not a new artifact.

**Essential properties.**
- **Off by default — one canonical truthiness rule.** The signal is the env var `PIPELINE_INTERACTIVE`. **Interactive mode is on iff the value is exactly the literal string `1`; every other value — unset, empty, `0`, `true`, anything else — is autonomous.** This rule is stated once canonically (in `pipeline/SKILL.md` and, because `/concept` runs upstream standalone, a byte-identical second copy in `concept/SKILL.md`); every other touchpoint references it rather than re-deriving its own check. Autonomous mode = today's behavior, byte-for-byte in committed output.
- **Two touchpoints, two homes.** Interactive mode governs the **ship summary** (in-pipeline, in `/ship`) and — via the same env var read by `/concept` upstream — the **concept recap** (upstream-of-pipeline, in `/concept`). The pipeline only threads the ship touchpoint; the recap is reached during the founder's standalone `/concept` run before the pipeline is invoked.
- **Read once per consumer, never re-derived.** `/pipeline` reads it once at run start and threads the ship touchpoint; `/concept` reads it itself when run upstream; both apply the single canonical rule. No consumer invents its own truthiness check.
- **Additive-only.** Enabling it adds two human gates; it removes nothing, reorders nothing, and changes no committed artifact.
- **Per-run, not per-machine.** It is a property of one invocation, not persistent config.

**What it is NOT.**
- **Not a presence check.** It does not ask "is a human reachable?" at each step. It is an explicit opt-in the founder sets when they intend to steer. (Contrast AJ3's `/human-design-review`, which is gated on *stakes, not presence* — AJ2 must not conflate the two. AJ2's touchpoints are presence-driven-by-opt-in and never park an autonomous run.)
- **Not A/B mode.** `PIPELINE_AB_MODE=1` is an orthogonal flag (it keeps the PR draft for replay). A/B runs are autonomous: interactive mode stays OFF under A/B. The two flags are independent; A/B never implies interactive.
- **Not the cron/autonomous path.** The unattended scheduler path always runs autonomous (signal absent). It never blocks on a touchpoint.
- **Not a change to phase order or persona separation.** The six phases, their order, and the designer/reviewer/builder boundaries are untouched.

**Composition.** Interactive mode carries one signal (the env var). It governs two touchpoints: the **concept recap** (Noun 2) and the **ship summary** (Noun 3). It composes with `PIPELINE_AB_MODE` orthogonally.

**Lifecycle.** Read by `/concept` at the upstream recap moment; read once at pipeline start for the ship touchpoint → held for the run → consulted at the ship summary site → discarded at run end. No persisted state. (The recap touchpoint fires before the pipeline run even begins.)

**Authority.** The founder sets it (by exporting the env var before running `/concept` and `/pipeline`). `/concept` reads it directly for the upstream recap; the orchestrator reads it and owns threading it to the **ship** touchpoint. No sub-skill flips it. Both consumers apply the single canonical truthiness rule.

**Contracts.**
- **Cardinality:** one signal per run, governing exactly two touchpoints.
- **Closure:** closed — exactly two touchpoints in AJ2 scope (recap, summary). Adding a third touchpoint is a concept-doc change, not a free extension. (AJ3's design-review touchpoint is a *separate* gate, stakes-driven, out of AJ2 scope.)
- **Default:** OFF. The autonomous path is the sacrosanct default; CLAUDE.md's "There is NO human. Never pause." remains true whenever the signal is absent.
- **Hard rule:** interactive mode must NEVER alter the committed artifact set. If enabling it changed any committed file, the implementation has broken the concept.

---

## Noun 2 — Concept recap

**Classification:** New process noun (a human-readable gate output). NOT an artifact file.

**Identity.** The concept recap is a **plain-language, chat-surfaced account of what `/concept` just locked**, presented to the founder for a confirm-or-redirect decision *at the end of the `/concept` run, before the founder hands the locked concept to the pipeline*. It is prose in the conversation, derived from the already-written `concept.md` — a translation of the locked concept into a founder-readable summary plus a decision gate. It lives **inside `/concept`**, which the founder runs upstream — the pipeline does NOT run `/concept` (`pipeline/SKILL.md` lines 42–46), so the recap is upstream-of-pipeline, never a pipeline phase.

**Essential properties.**
- **Derived, not authored.** It restates the locked `concept.md` (Phase 5 fields) in plain language. It introduces no new decisions of its own; it surfaces decisions already made.
- **Three content beats:** what the noun **is**, what it **is not**, what it **commits to** (the contracts). These map directly onto the concept doc's Definition / "What it is not" / Contracts sections.
- **Carries a gate.** It ends in a binary founder choice: **confirm** (proceed) or **redirect** (send concept work back). Surfaced via a single `AskUserQuestion`.
- **Ephemeral.** It lives in chat. It is not written to disk, not committed, not maintained as a file the pipeline must keep in sync.

**What it is NOT.**
- **Not a new artifact file.** The concept doc (`plans/AJ2/concept.md`-style) remains the only on-disk concept output. The recap is a *view* of it in chat, never a second source of truth.
- **Not the concept doc itself.** The doc is the locked contract for downstream agents; the recap is a founder-facing plain-English digest with a gate attached.
- **Not a re-litigation of the concept.** Confirm proceeds; redirect returns to concept work. It does not invite freeform concept editing in chat — redirect routes back into the `/concept` skill's own probing.
- **Not emitted in autonomous mode.** When the signal is absent, `/concept` writes its doc and the pipeline proceeds exactly as today — no recap, no `AskUserQuestion`.

**Composition.** Reads from the locked `concept.md`. Emits one `AskUserQuestion` with two options (confirm / redirect). Redirect re-enters concept work; confirm releases the pipeline to `/design`/`/architecture`.

**Lifecycle.** `/concept` locks the doc → (if interactive) recap is emitted → founder confirms or redirects → confirm: `/concept` returns, founder invokes the pipeline on the confirmed concept; redirect: return to concept work, re-emit recap, do NOT release for the pipeline. **The redirect loop is bounded at 3 rounds** — after a 3rd redirect without confirm, the concept is marked `blocked: concept-contested` and is not released to the pipeline (mirrors the pipeline's universal max-3 loop discipline). In autonomous mode this lifecycle collapses to "lock → proceed."

**Authority.** `/concept` emits the recap (it owns the locked concept). The founder owns the verdict. The orchestrator gates phase progression on the verdict.

**Contracts.**
- **Cardinality:** one recap per `/concept` lock, in interactive mode only.
- **Fires:** after `/concept` locks (after Phase 6 self-critique, doc committed), before `/design`/`/architecture` proceed.
- **Hard rule:** the recap and its gate change nothing about the committed concept doc. Confirm/redirect controls *progression*, not *content* — redirect re-runs concept work to produce a new locked doc; it does not hand-edit the recap.
- **Redirect semantics:** "redirect" = "the locked concept is wrong, go back" — it returns control to concept work and does NOT release the concept to the pipeline on the rejected concept.
- **Bounded redirect (max 3):** the confirm/redirect loop is capped at 3 redirect rounds, like every other pipeline loop. After the 3rd redirect without a confirm, the concept is marked `blocked: concept-contested` (sibling to the pipeline's `concept-or-spec-misalignment`) and is not released. The founder retains the final say, but the loop terminates deterministically — an unbounded human-gated loop would be a hole in this gate's own closure contract.

---

## Noun 3 — Ship summary

**Classification:** New process noun (a human-readable pre-merge account). NOT an artifact file.

**Identity.** The ship summary is a **readable, chat-surfaced account of a change that has reached CI-green, presented to the founder before the human merge.** It is the legible answer to "what am I about to merge?" — distinct from the raw CI pass/fail signal. It is prose, assembled from artifacts that already exist (the PR, the AC table, the diff, the retro), surfaced just before the existing human-merge gate.

**Essential properties.**
- **Five content beats:** (1) what shipped — one-paragraph plain-English description; (2) which ACs were covered; (3) which files changed; (4) the retro cost signal (from Phase 6 retro); (5) residual risk — anything the founder should weigh before merging.
- **Distinct from CI status.** CI-green says "the gates passed." The ship summary says "here is *what* passed and what it means." Both are present; the summary does not replace the CI check.
- **No-fabricate fallback.** The retro template does not guarantee a named "cost signal" or "residual risk" field. When a beat's source is absent, the summary states **"not recorded"** — it never estimates, infers, or invents a value. A fabricated cost or invented risk is worse than an honest "not recorded": it misleads the merge decision the summary exists to inform.
- **Pre-merge, post-CI-green.** It fires after `/ship` confirms CI green (step 7) and before the human merges (step 8). The merge still waits for the human — the summary informs that wait, it does not automate it.
- **Ephemeral.** Chat prose. Not a committed file. Sourced from existing artifacts; maintains no new on-disk state.

**What it is NOT.**
- **Not a new artifact file.** No `ship-summary.md` to write or keep in sync. The PR body, AC table, diff, and retro already hold the facts; the summary is their chat-surfaced digest.
- **Not the raw CI result.** `gh pr checks` green is the gate; the summary is the human-readable account. Conflating them loses the founder-facing legibility the WP exists to add.
- **Not an auto-merge.** It changes nothing about ship's merge stance: `/ship` still stops at CI-green and the human still runs `gh pr merge`. The summary precedes the human decision; it does not make it.
- **Not emitted in autonomous mode.** Autonomous and A/B runs reach CI-green and stop (A/B keeps draft for replay) with no summary and no founder prompt. The committed artifacts and the merge stance are unchanged.

**Composition.** Reads the PR (what shipped, files changed), the reviewer's AC table (ACs covered), and `plans/<id>/retro.md` (cost signal, residual risk). Emits prose in chat. Does not emit an `AskUserQuestion` gate of its own — the existing human-merge decision is the gate; the summary is the briefing for it. (It is informational, not a confirm/redirect like the recap, because the merge gate already exists and is owned by the human; AJ2 makes that wait *legible*, it does not add a second gate.)

**Lifecycle.** `/ship` reaches CI-green → (if interactive) ship summary surfaced in chat → human reads, then merges (or not) on their own clock. In autonomous/A/B mode: reach CI-green → stop, no summary.

**Authority.** `/ship` emits the summary (it owns the CI-green moment and the merge boundary). The founder owns the merge decision. The orchestrator does nothing extra — `/ship`'s existing "stop at CI-green, leave merge to human" is unchanged.

**Contracts.**
- **Cardinality:** one summary per `/ship` reaching CI-green, in interactive mode only.
- **Fires:** after CI-green (ship step 7), before human merge (ship step 8).
- **Hard rule:** the merge gate is unchanged — CI-green-before-merge stays mandatory, and the human still merges. The summary is additive briefing, never an automation of the merge.
- **Distinctness rule:** the summary must be more than CI pass/fail — it must carry the five beats. A summary that just echoes "CI green" has not satisfied the concept.

---

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **interactive mode** | Opt-in run mode of `/pipeline`; adds the two founder touchpoints. Default off. | "interactive pipeline", "steer mode", "human mode", "presence mode" |
| **autonomous mode** | The default run mode; today's behavior, no touchpoints. | "headless", "cron mode" (cron is one *caller* of autonomous mode, not a synonym) |
| **concept recap** | Plain-language chat digest of the locked concept + confirm/redirect gate. | "concept summary", "concept review", "concept approval doc" |
| **ship summary** | Readable chat account of a CI-green change, surfaced before the human merge. | "ship report", "merge summary", "PR summary" (the PR *body* is a separate artifact) |
| **touchpoint** | A founder-facing moment interactive mode adds (recap, summary). | "checkpoint" (AJ3 uses "checkpoint" for its stakes-gated review; keep them distinct), "gate" (the ship gate is a different thing) |

---

## Contracts (consolidated — the hard lines)

1. **Autonomous is the default and is sacrosanct.** Signal absent ⇒ today's behavior, identical committed artifacts, zero founder prompts. CLAUDE.md's "There is NO human. Never pause." remains literally true in autonomous mode.
2. **Touchpoints are strictly additive.** Enabling interactive mode adds the recap and summary; it never alters, reorders, removes, or adds any committed file, and never changes phase order, persona separation, or the ship gate.
3. **The recap and summary are chat prose, not artifact files.** No new on-disk files for the pipeline to maintain. They are derived views of existing artifacts.
4. **The cron/autonomous path never blocks on a touchpoint.** No `AskUserQuestion` is emitted when the signal is absent. A/B mode stays autonomous (no interactive touchpoints).
5. **CI-green before merge stays mandatory; the human still merges.** The ship summary informs the existing human-merge wait; it does not automate it.
6. **The recap's redirect returns to concept work; it does not proceed.** Confirm/redirect gates *progression*, not concept-doc content. **The redirect loop is bounded at 3 rounds**; after 3, the concept is `blocked: concept-contested` and is not released to the pipeline.
7. **The recap lives in `/concept`, upstream of the pipeline.** The pipeline does not run `/concept` (lines 42–46), so the recap is NOT a pipeline phase — it fires at the end of the founder's standalone `/concept` run. Only the ship summary is a pipeline-owned touchpoint.
8. **One canonical `PIPELINE_INTERACTIVE` rule.** Interactive iff value == `1`; every other value autonomous. Stated once, referenced everywhere; no consumer re-derives its own truthiness check.
9. **AJ2 must not pre-empt AJ3.** AJ2's touchpoints are opt-in/presence-style and additive; AJ3's design review is stakes-gated and can *park* an autonomous run. They are different mechanisms — AJ2 introduces no parking and no stakes gate.

## Rejection list (consolidated)

- **No new artifact files** (no `recap.md`, no `ship-summary.md`). — Spec constraint: "human-readable prose surfaced in chat, not new artifact files the pipeline must maintain."
- **No presence check at each step.** — Interactive mode is a single explicit opt-in, not a per-step "is a human there?" poll. Presence-based parking is AJ3's stakes gate, not AJ2.
- **No change to autonomous decision-making.** — Out of scope per spec; the touchpoints surface decisions already made, they do not change how autonomous mode decides.
- **No auto-merge.** — The human-merge boundary is unchanged.
- **No new CI behavior.** — Out of scope per spec; the summary reads existing CI status, it adds no gate.
- **No second concept source of truth.** — The recap is a view of `concept.md`, never a parallel record.

## Rationale

The founder reframe (2026-06-13): the pipeline is "powerful but illegible and unsteerable in the moments that matter." The concept is the single most expensive thing to get wrong — it ripples through every downstream variant and contract — yet today it locks silently with no founder-facing recap, and `/ship` stops at a CI-green PR with no readable account of the change. The founder either reads raw artifact files or approves a merge blind. AJ2 adds exactly two legible touchpoints at exactly the two expensive moments, *as an opt-in*, so that the unattended pipeline — which is correct to run silently and never pause — is untouched. The discipline that makes this safe is the strictly-additive contract: the same run, autonomous or interactive, commits the same artifacts; interactive mode only adds chat-surfaced briefings and (for the concept) a go/no-go gate. Keeping the recap and summary as ephemeral chat prose (not files) is deliberate: a new artifact file would create a maintenance burden and a second source of truth, defeating the legibility goal.

## Planning-time note (work-planning)

The AJ2 plan-calls name `/work-planning` in scope. The honest read: AJ2 itself is *not* an authoring-time change to `/work-planning`'s spec template — the planning-time *human-design-review forecast* field belongs to **AJ3** (its ACs say `/work-planning` and `/concept` estimate whether a WP will park for human design review). For AJ2, the only `/work-planning` touch is a **one-line note** that the founder can run the pipeline in interactive mode (the opt-in env var) when they intend to steer — an awareness pointer, not a new spec field and not a new gate. Architecture spells out the exact one-line edit. This keeps AJ2 from leaking AJ3's planning-forecast scope.
