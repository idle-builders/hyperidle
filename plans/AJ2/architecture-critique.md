# AJ2 Architecture Critique — Interactive Pipeline Mode

**Reviewer pass.** Scored the designer's `concept.md` + `architecture.md` against the 9-dimension architecture rubric, with focused scrutiny on the AJ2-specific contracts: autonomous parity, strictly-additive scope, no-new-artifact-files, content-contract completeness, redirect semantics, mode-selection mechanism, and verification honesty.

Plan under review: `plans/AJ2/architecture.md` (markdown-only edits to four skill files). Spec: `.pipeline/work-packages/TRACK-AJ.md` (AJ2 section + track intro). Skills checked for feasibility: `pipeline/SKILL.md`, `concept/SKILL.md`, `ship/SKILL.md`, `work-planning/SKILL.md`.

---

## Per-dimension scores (1–10)

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | **Spec/contract fidelity** | 8 | Honors strictly-additive, no-new-files, no-auto-merge, CI-green-stays-mandatory, AJ3-non-pre-emption. One real gap: the concept-recap firing site contradicts the pipeline's existing "pipeline does NOT run `/concept`" pre-condition (see CRITICAL-1). |
| 2 | **Autonomous parity / mode-gating** | 8 | Every touchpoint wrapped in an explicit `If PIPELINE_INTERACTIVE=1:` guard with a stated "absent in autonomous mode" clause. Continuous-commit table untouched. Weak point: gate is prose-only with no mechanical assertion that no instruction leaks outside the guard (see WARNING-1). |
| 3 | **Mode-selection mechanism** | 9 | Env-var choice is well-justified (mirrors `PIPELINE_AB_MODE` precedent, avoids positional-arg collision, natural opt-in). Read-once-and-thread is explicit. A/B orthogonality stated cleanly. Minor: "value ≠ `1`" parsing rule should be one canonical check, not re-derived per-skill (see WARNING-3). |
| 4 | **Content-contract completeness** | 8 | Recap (3 beats) and ship summary (5 beats) both fully enumerated with named sources. Recap's multi-noun handling specified. Gap: the recap's source-field mapping assumes a concept doc structure that the satellite/multi-noun case may not cleanly produce, and the ship summary sources `plans/<id>/retro.md` "residual risk" + "cost signal" that the retro template does not guarantee as named fields (see WARNING-2). |
| 5 | **Redirect semantics** | 6 | Direction is correct (redirect returns to concept work, does not proceed). But the loop is **unbounded** — no cap on confirm/redirect rounds, unlike every other pipeline loop which is "max 3" (see CRITICAL-2). Also under-specified: who re-runs `/concept` on redirect inside the pipeline given the pre-condition contradiction. |
| 6 | **Layering / persona separation** | 9 | No persona boundary moved. Recap emitted by `/concept` (owns the lock), summary by `/ship` (owns CI-green). Orchestrator only gates progression. Clean. |
| 7 | **Scope discipline (no creep)** | 9 | Explicit out-of-scope guards: no forecast field in work-planning (AJ3), no parking, no stakes gate, no CI change, no AB change. work-planning reduced to a one-line pointer — correctly resisting AJ3 scope leak. |
| 8 | **Verification honesty** | 8 | Correctly refuses fake `readFileSync`/grep "tests" (CLAUDE.md-aligned) and names the right proof: structural diff-read + founder walkthrough. Honest about no importable runtime. Could be sharper: a legitimate cheap static guard exists and would harden parity (see WARNING-1). |
| 9 | **Feasibility / edit precision** | 7 | Line-number references all verified accurate against the live skill files. Section-insertion points are real. But "Phase 7" naming in `/concept` collides conceptually with the pipeline's 6-phase model, and the concept-recap firing site is infeasible as written under the current pipeline pre-condition (see CRITICAL-1). |

**Overall: 7.8 / 10**

---

## Findings

### CRITICAL

**CRITICAL-1 — The concept recap's firing site contradicts the pipeline's own pre-condition; the plan never reconciles it.**
`pipeline/SKILL.md` lines 42–46 state unambiguously: *"The pipeline does NOT run `/concept`. Concept-locking is upstream founder work... Those decisions need founder input and don't fit an autonomous pipeline,"* and it fails fast with `blocked: concept-missing` if concept work is absent. The plan (§1, §4a) threads the recap through "Phase 1 designer dispatch → after `/concept` locks." But in the pipeline as it exists, `/concept` does **not** run inside Phase 1 — the founder runs it upstream, standalone. So "after `/concept` locks, the designer emits the recap" describes a step the pipeline does not currently own. (The Phase-1 table row at line 114 listing `/concept` is itself in tension with the pre-condition — a pre-existing inconsistency the plan inherits but must not paper over.)

*Why it matters:* the recap's entire AC ("After a concept is locked in interactive mode... before design/architecture proceed") hinges on *where* `/concept` runs. As written the builder cannot place the recap correctly — it will either bolt it onto a pipeline phase that doesn't run `/concept`, or silently assume the pipeline now runs `/concept` (a structural change the plan disclaims).

*Fix:* the plan must explicitly state the recap's home. Two honest options, pick one and write it: **(a)** the recap fires inside `/concept` itself (Phase 7 of the *concept skill*, already proposed in §4b) and is therefore surfaced whenever the founder runs `/concept <id>` with `PIPELINE_INTERACTIVE=1` — i.e. at the *upstream founder* step, NOT inside the pipeline run; the pipeline's Phase-1 dispatch line in §4a is then wrong and must be dropped or reworded to "if the founder ran `/concept` interactively upstream, the recap already happened — the pipeline does nothing extra." **(b)** Interactive mode explicitly amends the pre-condition so the pipeline DOES run `/concept` when interactive — but that is a phase-order/structural change the strictly-additive contract forbids, so (a) is almost certainly the correct reconciliation. Either way, resolve the contradiction in text; do not ship it ambiguous.

**CRITICAL-2 — The redirect loop is unbounded.**
§2 (concept-recap, confirm-vs-redirect): "Redirect → `/concept` returns to concept work... produce a revised locked doc." There is no cap on redirect→re-probe→recap→redirect cycles. Every other loop in the pipeline is bounded "max 3 attempts" (`pipeline/SKILL.md` lines 234–237; ship lines 117). An unbounded human-gated loop is less dangerous than an autonomous one (a human chooses to stop), but the concept doc's own Contracts section claims the recap is a closed, well-specified gate — an unbounded loop is a hole in that contract and a divergence from the pipeline's loop discipline.

*Fix:* state a bound (e.g. "max 3 redirect rounds; after 3, surface the disagreement and stop / mark `blocked: concept-contested`"), consistent with the existing `concept-or-spec-misalignment` blocked-reason at pipeline line 237. One line in §2 and the concept doc's redirect contract.

### WARNING

**WARNING-1 — Parity is asserted by prose only; a cheap, honest static guard exists and should be named.**
§5 correctly rejects fake `readFileSync` "tests" — good. But it then leans the entire parity guarantee on "the reviewer reads the diff" + founder walkthrough. There is a legitimate, CLAUDE.md-compliant static check the plan could name (not as a "test" but as a structural lint/guard): a grep-style assertion in CI or a pre-commit lint that **every line introducing an `AskUserQuestion` or a touchpoint marker in these four skill files sits under a `PIPELINE_INTERACTIVE` guard**. CLAUDE.md explicitly says static codebase properties belong to lint rules, not tests — so this is the *correct* tool, not a forbidden fake test. The plan dismisses all mechanical checks together; it should distinguish "no fake unit test" (right) from "a structural lint guard is appropriate and cheap" (also right). At minimum, specify the exact reviewer-checklist assertion as a named, repeatable check so parity isn't re-litigated by eyeball every future edit.

*Fix:* add a short "Structural guard" note: the invariant is "no touchpoint instruction outside a `PIPELINE_INTERACTIVE=1` guard," and state whether it is enforced by (a) a documented reviewer-diff checklist item (acceptable for markdown) or (b) a lightweight repo lint. Do not invent a runtime test. Just make the guard nameable and repeatable.

**WARNING-2 — The ship-summary and concept-recap source fields assume artifact structure the upstream templates do not guarantee.**
§3 sources beats 4 (retro cost signal) and 5 (residual risk) from `plans/<id>/retro.md`, and §2 sources the recap's three beats from named concept-doc sections. But: (a) the `/retro` output is not contractually guaranteed to carry a named "cost signal" or "residual risk" field — the plan asserts these exist without citing the retro template; if the retro prose lacks them, the builder will fabricate or omit. (b) The recap's "commits to" beat maps to the concept doc's Contracts section, which for a multi-noun concept (like AJ2 itself) is split per-noun — the plan's "covers the central noun, names satellites in one line" rule is sound but doesn't say how to collapse multiple Contracts blocks.

*Fix:* for the ship summary, state the fallback when a source field is absent ("if the retro emits no explicit cost signal, say 'no cost signal recorded' — never fabricate"). For the recap, confirm the source mapping against the actual concept-doc template (`concept/SKILL.md` Phase 5 doc structure) and state the multi-noun collapse rule explicitly.

**WARNING-3 — The env-var parsing rule is stated as "unset / any value ≠ `1`" but each sub-skill is told to read it independently — risk of divergent truthiness checks.**
§1 says the default is "unset / any value ≠ `1`" and also says sub-skills "tolerate reading the env var directly." If `/pipeline`, `/concept`, and `/ship` each implement their own "is it `1`?" check in prose, a future edit could drift (one accepts `true`, another only `1`). The concept doc's "read once, threaded down" property is the right design; the architecture slightly undercuts it by also blessing independent reads.

*Fix:* state one canonical rule once ("interactive ⇔ the literal string `1`; everything else, including unset/empty/`0`/`true`, is autonomous") and have the sub-skill sections reference it rather than restate it. Keep "orchestrator's threaded instruction is authoritative inside the pipeline" as the primary path; the direct-read is only the standalone-invocation fallback.

### NICE-TO-HAVE

**NTH-1 — "Phase 7" naming in `/concept` risks confusion with the pipeline's 6-phase model.** The pipeline has a canonical "6-phase pipeline" (table at line 110). Adding a `/concept`-internal "Phase 7" reuses "Phase" for a different axis. Consider naming it "Recap gate" or "Post-lock recap (interactive)" rather than "Phase 7" to avoid a reader conflating it with a seventh pipeline phase. Cosmetic but cheap.

**NTH-2 — The ship summary fires "before step 8" but step 8 is also where autonomous A/B flips draft.** §3 places 7a between ship steps 7 and 8. Confirm the insertion does not perturb the A/B autonomous path: in A/B mode `PIPELINE_INTERACTIVE` is absent, so 7a is skipped — the plan says this, but spell out that the *skip* leaves step 8's existing A/B branch (`gh pr ready` skipped) byte-identical. One sentence.

**NTH-3 — Redirect note plumbing.** §2 says the founder's free-text redirect note "seeds the revision." Worth one line on how that note reaches `/concept`'s probing (it's the `AskUserQuestion` response text) so the builder doesn't invent a new channel.

---

## Verdict

The plan is well-scoped, scope-disciplined, line-accurate, and verification-honest — it correctly resists AJ3 scope leak and correctly refuses fake tests. Two issues block approval as written: **CRITICAL-1** (the recap's firing site contradicts the pipeline's "does NOT run `/concept`" pre-condition — the builder cannot place the recap deterministically), and **CRITICAL-2** (the redirect loop is unbounded, diverging from the pipeline's universal max-3 discipline and the concept's own closure claim). Both are one-to-two-line text fixes, not redesigns.

**Overall score: 7.8 / 10**

**Verdict: NEEDS-REVISION** (score ≥7 but two CRITICAL findings present).

---

## Round 2 re-critique

Re-scored the revised `architecture.md` + `concept.md` against the round-1 findings, with a fresh pass for revision-introduced issues. All feasibility claims re-verified against the live skill files (pipeline pre-condition lines 42–46; concept Phase 1 line ~60, Phase 5 doc structure lines 112–131, Phase 6 line 133; ship steps 7/8 lines 86/121; pipeline loop rules lines 234–237).

### Per-finding resolution

**CRITICAL-1 — RESOLVED.** The recap is now homed unambiguously inside `/concept` (new "## Recap gate" section after Phase 6, before "## Output", §4b), firing at the END of the upstream standalone `/concept` run — *before* the founder ever invokes `/pipeline`. The pipeline owns ONLY the ship summary; §4a explicitly forbids any Phase-1 recap dispatch and leaves the Phase-1 block untouched. The firing site is now deterministic ("after Phase 6 self-critique, doc committed, before control returns to the founder") and fully consistent with the "pipeline does NOT run `/concept`" pre-condition — the plan reconciles it by placement, not by amending the pre-condition. **End-to-end AC check passes:** "before design/architecture proceed" holds because the gate sits upstream of the pipeline run entirely; the pipeline's design/architecture phases cannot start until the founder confirms and *then* invokes `/pipeline` on the confirmed concept. The arch (§5, line 5) walks this through correctly.

**CRITICAL-2 — RESOLVED.** Redirect loop bounded at max 3 → after the 3rd redirect without Confirm, concept marked `blocked: concept-contested` and not released (§2 "Bounded redirect loop", §4b "Bound", concept Contract 6/8). Mirrors the pipeline's universal max-3 discipline; the new reason is named as a sibling to `concept-or-spec-misalignment` (line 237, verified). Downstream catch is the pipeline's existing `concept-missing`/misalignment fail-fast. Terminates deterministically.

**WARNING-1 — RESOLVED.** §5(a) names a concrete "structural parity guard" as a repeatable reviewer-diff checklist assertion — the invariant "no touchpoint instruction outside a `PIPELINE_INTERACTIVE == 1` guard" with four enumerated per-file checks — and explicitly distinguishes it from a forbidden `readFileSync`/grep fake test (correctly citing CLAUDE.md: static property → checklist/lint, not a runtime test). It runs alongside, not instead of, the founder walkthrough (§5b). Adequate for a markdown-only WP.

**WARNING-2 — RESOLVED.** No-fabricate fallbacks present and per-beat (§3 "No-fabricate fallback rule"): beat 4 → "cost signal: not recorded", beat 5 → "residual risk: none recorded", beats 1–3 → "not available — see PR review", with the one-line rule "a beat with no source says 'not recorded,' never a guess." Multi-noun collapse rule present (§2): central noun's three beats in full, each satellite one line drawn from its Contracts hard rule (fallback: Definition), capped at the New/Reshaped noun count.

**WARNING-3 — RESOLVED.** One canonical truthiness rule stated verbatim once (§1, "THE CANONICAL TRUTHINESS RULE"): interactive iff value is exactly the literal `1`. Two byte-identical copies (pipeline + concept) — justified because `/concept` runs standalone upstream and cannot depend on the pipeline section being in context; the byte-identity is called out so no drift is possible. `/ship` and `/work-planning` reference, never re-derive. The orchestrator's threaded instruction is authoritative inside the pipeline; direct-read is the standalone fallback only. Not re-derived by consumers.

### New findings (fresh pass on the revision)

No new CRITICAL or WARNING. The split (recap upstream-in-`/concept`, summary in-pipeline-in-`/ship`) is internally consistent and the concept doc's Contracts 7–8 lock it. Three NICE-TO-HAVE only:

**NTH-4 (new) — `blocked: concept-contested` has no progress-file home in `/concept`.** `/concept` is a standalone founder skill with no progress-JSON/blocked-marking machinery (verified: no `blocked`/`progress` write mechanism in `concept/SKILL.md` — that lives in `/pipeline`). The plan's "marks the concept `blocked: concept-contested` and stops" is therefore a *chat verdict that gates whether the founder hands the concept to the pipeline*, not a file write. This is actually correct (no progress file exists upstream of the pipeline), but the builder could mistakenly try to write a progress file from a skill that has none. One line clarifying "this is a returned verdict in chat, not a progress-file write" would prevent that.

**NTH-5 (new) — concept-doc has no field literally named "Hard rule".** §2's multi-noun collapse sources the satellite line from "that noun's Contracts 'Hard rule'". The Phase 5 template (verified, line 98) names the field "Hard rules" (plural) inside the Contracts block, not "Hard rule". Trivial naming drift; the explicit "or if none, its Definition" fallback means the builder cannot be stranded. Cosmetic.

**NTH-1/2/3 from round 1** remain addressed: "Recap gate" naming adopted (not "Phase 7"); the A/B-skip byte-identity is stated (§1 "A/B and cron stay autonomous", §3 autonomous behavior); the redirect-note channel is named as the `AskUserQuestion` response text (§2, §4b).

### Final score

| Dimension | R1 | R2 |
|---|---|---|
| 1 Spec/contract fidelity | 8 | 9 |
| 2 Autonomous parity / mode-gating | 8 | 9 |
| 3 Mode-selection mechanism | 9 | 9 |
| 4 Content-contract completeness | 8 | 9 |
| 5 Redirect semantics | 6 | 9 |
| 6 Layering / persona separation | 9 | 9 |
| 7 Scope discipline | 9 | 9 |
| 8 Verification honesty | 8 | 9 |
| 9 Feasibility / edit precision | 7 | 8 |

**Overall: 8.9 / 10**

### Verdict

Both CRITICAL findings genuinely resolved by placement (recap → `/concept`, upstream of the pipeline) and by a bounded loop (max 3 → `concept-contested`); all three WARNINGs resolved with concrete, named mechanisms. No new CRITICAL or WARNING introduced — only two cosmetic NICE-TO-HAVEs. The end-to-end AC ("recap before design/architecture proceed") holds because the gate sits entirely upstream of the pipeline run.

**Verdict: APPROVED** (score ≥7, zero CRITICAL).
