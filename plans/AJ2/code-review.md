# AJ2 Code Review — Interactive Pipeline Mode

**Scope:** Markdown-only change to four skill files in `.claude/skills/`. No product code. Reviewed `git diff origin/main...HEAD -- .claude/skills/`.

**Method note:** Per the approved plan §5, this is a prompt-instruction (markdown) change with no importable runtime — the correct verification tools are the structural parity diff-read (this review's load-bearing check) + founder walkthrough, NOT a runtime test. The diff adds no fake `readFileSync`/grep "tests" (CLAUDE.md-forbidden) — correct. The attestation commit (`verify-attest`) is present but only covers `test:all`; no behavioral assertion was invented for a docs change. Good.

---

## AC table

| AC | Satisfied? | Evidence |
|---|---|---|
| **AC1** — Two modes; autonomous unchanged, interactive adds touchpoints | YES | `pipeline/SKILL.md` new "## Run modes" section defines the two modes; preamble qualifier marks autonomous as **default**, interactive as additive. "Hard rule: interactive mode never alters the committed artifact set, phase order, persona separation, or the ship gate." Touchpoints both behind explicit `== 1` guards. |
| **AC2** — Post-lock concept recap (is / is-not / commits-to) + confirm/redirect before design/arch proceeds | YES | `concept/SKILL.md` "## Recap gate" — three beats explicitly enumerated; single `AskUserQuestion` Confirm/Redirect; Redirect "**returns to concept work** … does NOT return control for the pipeline to proceed on the rejected concept." Fires after Phase 6, after doc committed, before `/concept` returns. |
| **AC3** — Pre-merge ship summary (what shipped / ACs / files / retro cost / residual risk), distinct from raw CI | YES | `ship/SKILL.md` "### 7a. Ship summary" — five beats enumerated, sourced from PR body / AC table / `git diff --stat` / `retro.md`; "A summary that merely echoes 'CI green' has not satisfied this step." Inserted between step 7 (CI-green) and step 8 (merge). |
| **AC4** — Autonomous/cron path never blocks; identical committed artifacts | YES | Every touchpoint gated `PIPELINE_INTERACTIVE == 1`; each carries an explicit "in autonomous mode this step is absent / skip entirely" clause. A/B path called out as byte-identical to pre-AJ2. Continuous-commit table, phase table order, persona columns untouched in the diff. |

All four ACs satisfied. All three validation scenarios covered (redirect→back not proceed; summary-before-merge with human still gating; autonomous emits no prompt).

---

## Decisive checks

1. **Structural parity guard (load-bearing) — PASS.** Walked every touchpoint instruction in the diff:
   - Concept recap → under "### If interactive (`PIPELINE_INTERACTIVE` == `1`)`" with sibling "### If not interactive (default) … skip this section entirely … no recap emitted, no `AskUserQuestion`."
   - Ship summary → under "**If interactive (`PIPELINE_INTERACTIVE` == `1`):**" with sibling "**If not interactive:** skip this step entirely."
   - Pipeline ship-dispatch pseudo-block → "If PIPELINE_INTERACTIVE is exactly '1' … In autonomous mode this step is absent."
   No touchpoint leaks into a default path. **No `AskUserQuestion` and no recap instruction added to `pipeline/SKILL.md`** — confirmed by reading the full pipeline diff; pipeline only threads the ship summary and explicitly states "The concept recap is NOT a pipeline touchpoint."
2. **Canonical env rule — PASS.** The truthiness sentence is **byte-identical** between `pipeline/SKILL.md:43` and `concept/SKILL.md:148` (verified by extracting and `diff`-ing the "interactive mode is on if and only if … autonomous mode." span — identical). Trailing provenance clauses differ intentionally (one says "single source of truth," other says "second authoritative copy") — that is a cross-reference pointer, not a re-derivation of the rule. `ship` and `work-planning` reference, never restate. No drift.
3. **Additive-only — PASS.** Phase table rows/order unchanged; only an additive parenthetical on the ship row ("(+ ship summary … in interactive mode)") and the Phase-1 row explicitly NOT annotated. Persona columns untouched. Continuous-commit table not in diff. Ship gate (CI-green before merge) reinforced, not weakened — step 8 "Do NOT merge automatically" preserved verbatim with an additive clause.
4. **No new artifact files — PASS.** Recap and summary both repeatedly asserted as chat prose; explicit anti-patterns added forbidding `recap.md`/`ship-summary.md`. No file-write instruction introduced.
5. **Bounded loop — PASS.** "**Bound (CRITICAL): cap at 3 redirect rounds.** After a 3rd redirect without a Confirm, mark the concept **`blocked: concept-contested`** … Do NOT return a 'proceed' verdict." Mirrors pipeline max-3 discipline. Correctly noted as a chat verdict, not a progress-JSON write (`/concept` has no progress machinery).
6. **No-fabricate fallbacks — PASS.** Ship 7a: beat 4 → "cost signal: not recorded"; beat 5 → "residual risk: none recorded"; AC table missing → "AC coverage: not available — see PR review." One-line rule: "a beat with no source says 'not recorded,' never a guess."
7. **A/B orthogonality — PASS.** "A/B runs stay autonomous — interactive mode stays OFF under A/B"; ship 7a + pipeline both state the A/B branch is byte-identical to pre-AJ2.

---

## Findings

### CRITICAL
None.

### WARNING
None.

### NICE-TO-HAVE

- **NTH-1 (consistency, `ship/SKILL.md` step 8 cross-ref).** Step 8 now says "the founder reads the ship summary (step 7a)"; the new section header is "### 7a. Ship summary". Numbering is consistent. No action — noted only to confirm the cross-reference resolves.
- **NTH-2 (`concept/SKILL.md` redirect seeding).** The redirect re-enters "Phases 1–5" seeded by the founder's free-text `AskUserQuestion` reply. The skill relies on the agent re-reading prior probe answers; there is no instruction to persist the redirect note anywhere (by design — chat-only). Acceptable for a prompt instruction, but a future agent re-entering Phases 1-5 across a long session could lose the redirect note from context. Not a blocker for this WP; flagging as a latent fragility of the chat-only design, consistent with the concept's "no new channel" decision.
- **NTH-3 (slop check).** Prose is dense and repeats the canonical rule reference at every consumer. This repetition is intentional and load-bearing (the plan mandates "reference, not re-derive" at each site), not AI filler. No verbose-naming, dead-instruction, or "TODO on implemented" tells. Clean.

---

## Lens summary

- **Architecture:** Code matches plan §4a-4d section-for-section. The CRITICAL-1 split (recap in `/concept`, summary in `/ship`, pipeline owns only the summary) is honored exactly — pipeline diff contains no recap dispatch. Layer/ownership boundaries intact.
- **Design:** N/A — no UI surface.
- **Security:** N/A — no trust boundary, route, input, or secret. STRIDE not applicable to prompt-text. The one safety-relevant invariant (autonomous path never blocks) is enforced structurally and verified above.
- **Adversarial:** Saboteur check — no weakened gate, no autonomous-path leak, ship gate preserved verbatim. Auditor check — commit message claims ("opt-in interactive pipeline mode (concept recap + ship summary)") match the diff exactly. No silent regression to autonomous behavior.
- **Simplification:** No single-use helpers/dead code applicable. The two-copy canonical rule is justified (standalone `/concept`), not premature duplication.
- **Slop:** Clean (see NTH-3).

---

Verdict: DONE
