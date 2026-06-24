# AL6 Retro — Harness Review-Return Hooks

## Executive Summary

AL6 v1 shipped through full pipeline gates (architecture-critique 8/10, review DONE, CI green) but was rejected by founder post-merge. The rejection exposed three critical gaps:

1. **Flag ≠ Force.** AC1/AC3 require "not accepted as complete / redirected to return" (active forcing). v1 implemented only "surfaced as not-yet-returned" (passive flag). The gates praised the elegant observer seam but never challenged whether the weaker-arm implementation met the AC's strongest reading.

2. **Mechanism survey skipped.** The SDK's native `Stop` hook—purpose-built for exactly this use case (blocking turn-end + re-injecting guidance)—was never surveyed or rejected. v1 invented a passive observer instead. This violated ETHOS "Search Before Building."

3. **No live-LLM eval.** v1 shipped with only scripted stub tests. The project's rule (agent-behavior ACs require live evals) was not enforced by gates. v2 added a `force-return` scenario on real LLM (scored 1.000/1.000, ~$0.09).

v2 re-architecture added: hook-based forcing (SDK Stop hook + builtin loop interception), Tier-1/Tier-2 two-tier model, `SessionOutcome` union extended, `canForceReturn` capability descriptor, live eval. All viable from v1 planning had mechanism survey and live-eval requirement gated v1's completion.

**Cost:** v1 ~3.5h (full pipeline spent on under-delivery), v2 ~4h (re-architecture cycle). Total: ~7.5h + one full pipeline cycle consumed on a rejection that process gates should have prevented.

---

## The v1 → v2 Story

### What v1 Did (and Did Not)

| Aspect | v1 | v2 |
|---|---|---|
| **Mechanism** | Observer-in-loop (detects return) | Hooks + loop interception (forces return) |
| **Enforcement** | Event emit + verdicts flag (passive) | Tier-1 force (SDK Stop hook / builtin re-inject), Tier-2 reject (outcome: not_returned) |
| **AC1/AC3 reading** | "Surfaced as not-yet-returned" (weakest) | "Blocked from stopping, forced to return" (strongest) |
| **Test coverage** | Scripted stub LLM only | Scripted + live eval (1.000/1.000 on real LLM) |
| **Architecture gates** | Critique 8/10, review DONE | Critique 6/10 (round 1) → 8/10 (round 2) |
| **Lines of code** | ~70 (return-gate.ts) + wiring | ~300 (hooks + Tier-1 + Tier-2 logic) + canForceReturn descriptor table |

### What the Gates Missed — and Why

**Architecture-Critique (v1):** Scored 8/10, approved in round 1. Strengths identified:
- Observer seam is "genuinely correct and well-argued"
- Zero new adapter method, zero new event type
- +1 line per drain loop (the elegance trap)
- Exemption model clean

**What critique did NOT do:**
- Did not re-verify the claim "exactly two drain sites" against actual code grep (Reason: "verified by grep" was asserted, not re-grepped independently). When revisited in v2 round 1, the claim was false (five actual loops, three of which v1 never gated).
- Did not ask: "Does observation + event flag = 'not accepted as complete / redirected' per AC1/AC3 language?"
- Did not ask: "Were alternative mechanisms surveyed (SDK hooks, loop interception) and rejected with reasoning?"
- Did not flag: "This AC quantifies over agent behavior — where is the live-LLM proof?"

Both the support lenses and the adversarial lens optimized within the chosen mechanism (observer-only) instead of questioning whether the mechanism met the requirement.

**Review (v1):** Marked DONE, no artifact left in the repo. Since no review document exists, we infer: code review checked implementation structure, did not ask for live eval proof.

**Ship gate (/):** Accepted attestation. Did not check: "For agent-behavior ACs, is there a live eval, or only stubs?" — this check did not exist in the gate machinery.

---

## The Four Candidate Process Improvements (for `/compound`)

### 1a. Strongest-AC-Reading Audit in Critique

**Pattern:** AC language with either/or, force/passivity spectrum, or two-arm requirements goes through gates without anyone asking "does the chosen mechanism satisfy the strongest or weakest reading?"

**Signal:** v1's AC1/AC3 both have forcing language ("not accepted as complete / redirected"); the observer-only design chose the passive arm. Critique praised the seam without auditing fit.

**Fix candidate:** Extend `/architecture-critique` with an explicit **strongest-AC-reading lens**. When an AC has either/or or spectrum language, critic asks:
- "What is the strongest reading of this AC?" (example: "not accepted" → the agent cannot receive a completed outcome)
- "Does the architect's mechanism satisfy that reading, or a weaker one?" (example: observer can only flag; it cannot block)
- "Is the weaker choice justified by a constraint in the spec, or is it simplification trade-off?" (v1: pure simplification)
- "If it's a trade-off, does the AC allow it?" (v1's ACs do not; they demand force.)

**Frequency:** ~3+ occurrences likely in any harness/enforcement/agent-behavior track. (AL6 is one; AL2 may have had similar gate misses if it went through critique; agent-identity ACs often have "must reject / must accept" language.)

**Evidence base:** AL6 v1 critique (8/10) with audit → would have been 5/10 or "needs revision" on the mechanism-fit question.

---

### 1b. Live-LLM Eval Coverage Map in `/architecture` and DoD Enforcement in Gates

**Pattern:** An AC that quantifies over agent behavior or system responses to agent actions ships through gates without live-LLM proof. The DoD rule exists ("agent-behavior ACs need live evals") but is not wired into gate entry/exit.

**Signal:** v1 passed code-review and architecture-critique without a `force-return` scenario. Only scripted stubs proved the mechanism worked.

**Fix candidate:** Extend `/architecture` skill to require a **live eval coverage map** when ACs mention "agent," "model," "turn," "force," or any quantification over real-LLM behavior:
- Enumerate which evals will prove each AC
- Run them locally during build phase (before review)
- Carry proof (eval name + score) into review
- `/ship` gate checks: "For every agent-behavior AC, is there a passing eval in the build artifacts?" If not, block until eval added and passed.

**Frequency:** ~5+ ACs per year likely (agent-behavior threads are foundational). AL6, AL2, AK-series, AJ5 all have agent-behavior ACs.

**Evidence base:** v2's live eval (force-return, 1.000/1.000) proved the mechanism in ~4 min of LLM time (~$0.09). No such eval existed for v1; gates did not require one. If the eval requirement had been gating v1's build phase, v1 would have failed the eval and the mechanism gap would have surfaced 4h earlier.

---

### 1c. Mechanism Survey + Rejection in `/architecture` for Enforcement/Interception WPs

**Pattern:** A WP tasked with enforcement, interception, or forcing behavior invents a custom mechanism without surveying the SDK's native options. The custom mechanism is weaker than the native one.

**Signal:** v1 never asked "does the SDK have a native Stop hook?" Instead, designed a passive observer. The SDK hook (purpose-built for this exact use case) went unmentioned until v2's re-architecture.

**Fix candidate:** When `/architecture` receives an enforcement/interception story (marked in WP tags), require an explicit **mechanism-survey section**:
- List existing/native mechanisms in the SDK, framework, or project that could do the job
- For each, state: "Why chosen / Why rejected"
- If custom mechanism chosen, justify why native options are insufficient
- Cite source (SDK docs, framework API, X5 comments, etc.)

**Frequency:** ~2–3 per year (enforcement WPs are spiky). AL6 is one; AL2 (review routing enforcement) may have skipped the survey; any "gate" or "hook" WP should do this.

**Evidence base:** AL6 v1 lacked this section entirely. v2's `/architecture` section 0.1 reads the SDK docs directly ("source-driven") and documents the Stop hook + `decision: "block"` semantics. The plan explicitly notes "VERIFIED against installed `sdk.d.ts`" and "UNVERIFIED-AT-RUNTIME" (T7 proves it). This is the right discipline. v1 never did it.

---

### 2. Ship Gate (`/ship`) Live-Eval Coverage Check

**Pattern:** Agent-behavior WPs reach ship without a live eval, because the gate doesn't check for it.

**Signal:** v1 attestation passed (CI green, tests green) but no eval. The gate accepted it.

**Fix candidate:** Extend `/ship` to scan the build artifacts:
- If WP has agent-behavior ACs (detected: WP tags contain "agent" or "force" or "eval"), check for `.pipeline/eval-results/<scenario-name>.json` or similar proof
- If proof missing, block with message: "This WP has agent-behavior ACs but no eval proof. Run the eval locally and commit results, or defer the AC to a follow-up."
- If proof exists but score < 0.8, warn: "Eval score low; retry locally or revise mechanism"

**Frequency:** Every agent-behavior WP. ~5/year.

**Evidence base:** v1 → v2 cost difference. If `/ship` had checked for eval, v1 would not have shipped; v2 would have been planned + built + approved in one cycle instead of v1-reject + v2-rebuild.

---

## Key Observations (Not Candidates, But Signals)

1. **The simplification trap is real.** v1's observer was genuinely elegant: +1 line, zero new types, minimal coupling. The elegance was *within the chosen mechanism*. The adversarial lens in critique (which should challenge mechanism choice) was muted by the seam's simplicity. Lesson: praise simplicity of **implementation**, not simplicity of **requirement coverage**. If the simple mechanism doesn't do the job, say so.

2. **Code drift caught by critique, not first time.** v2's architecture-critique (round 1) independently re-grepped and found the "two sites" claim was false. This is the critique process working as designed (re-verify claims). But v1's critique did not re-verify, saying only "verified by grep." The difference: v2 had a clearly stated false claim (bet-decomposition exemption was a novel concept); v1's false claim was asserted in passing. Future: any claim that relies on source facts (counts, locations, patterns) should be re-verified by the reviewer, not taken on assertion.

3. **The v2 critique also caught a gap.** Round 2 approval came after the concept was clarified (internal-extraction-drain exemption, tools:[] predicate). This shows the process works when used properly: critique finds the gap, designer refines concept, critique re-scores. v1 got 8/10 in round 1; no round 2 was scheduled, suggesting confidence-creep after a single pass.

4. **Cost of full cycle on wrong design.** v1 cost ~3.5h (planning 1h + architecture 1.5h + build 1h + gates <0.5h, including critique + review). v2 cost ~4h (re-architecture 1h + build 2h + critique round 2 + review). Total ~7.5h + overhead. A single live-eval run (4 min) would have surfaced the mechanism gap at hour 2, saving 5+ hours of work downstream.

5. **Founder rejection caught the error, but too late.** The ideal gate would have been `/ architecture` round 2 with a live eval requirement, or `/ship` checking for eval proof. Instead, rejection happened post-merge. The gap is not that the gates are too weak (v2 critique worked well); it's that the gates did not integrate live-eval requirement for agent-behavior ACs.

---

## Mapped Observations → `/compound` Candidates

| Candidate | Pattern ID | Estimated Frequency | Root Cause |
|---|---|---|---|
| **Strongest-AC-reading audit** | 1a | ~3+/year | Critique optimizes mechanism within scope, not mechanism choice vs. spec |
| **Live-eval coverage map + DoD enforcement** | 1b | ~5+/year | Gate machinery does not check for live-eval proof of agent-behavior ACs |
| **Mechanism survey + rejection section** | 1c | ~2–3/year | Enforcement WPs skip SDK/native-option survey before custom design |
| **Ship gate live-eval check** | 2 | ~5/year | (Blocks 1b if live-eval cost too high; might de-prioritize 1b) |

---

## v1 vs v2 Side-by-Side (Mechanism)

### v1: Observer-in-loop (Passive)

```
Agent session running...
  → detects non-return attempt
  → observer.returned = false
  → gate.returned = false
  → evaluateReturn(gate, "completed") = "not_returned"
  → emit session_not_returned event
  → endSession(..., outcome: "not_returned")  // NO — v1 still said "completed"!
OUTCOME: completed (bug — should have been not_returned)
FORCING: none
```

### v2: Hook + Loop Intercept (Active)

```
Agent session running...
  → detects non-return attempt
  → Stop hook fires (SDK) OR loop-end check fires (builtin)
  → returnSeen = false && forceCount < 2
  → shouldForceReturn() → true
  → Tier-1 force: re-inject AL6_FORCE_RETURN_MESSAGE, continue turn
  → (agent called return, OR forceCount reached budget)
  → if still not returned: fall through to Tier-2 reject
  → evaluateReturn(gate, "completed") = "not_returned"
  → emit session_not_returned event
  → endSession(..., outcome: "not_returned")
OUTCOME: "not_returned" (correct — agent was not accepted as complete)
FORCING: 0–2 re-injections (Tier-1), then reject (Tier-2)
```

---

## Summary for `/compound`

Three distinct gaps in gate machinery + one shared root cause (integration of live-eval requirement into DoD + gate checks):

1. **Critique's mechanism-fit audit:** Does the chosen design satisfy the strongest AC reading, or does it optimize within a weaker reading?
2. **Architecture's mechanism survey:** For enforcement WPs, is the SDK/native option space surveyed before custom design?
3. **Gate integration of live-eval:** If an AC quantifies over agent behavior, require a passing eval (run locally, evidence in build artifacts, checked at ship gate).

All three would have caught AL6 v1 in the build/critique phase. The cost of ignoring them: full pipeline cycle (~7.5h) + founder rejection + v2 re-architecture.

---

## The v3 → v4? Story (This Round)

### What v3 Did (and Almost Didn't)

| Aspect | v2 | v3 |
|---|---|---|
| **Mechanism** | Hook + loop intercept (SDK+builtin only) | Re-prompt loop + sandbox-file rewrite (ALL harnesses) |
| **Harness scope** | Claude SDK + builtin (native hooks) | CLI + isolated + remote + builtin (uniform forcing via provisioning layer) |
| **Carrier** | `config.messages` (v2 claimed) | Sandbox instruction file (`AGENTS.md`/`CLAUDE.md`) rewritten between runs |
| **Layer-A vs Layer-B** | "native hook (fast) OR reject" | "native hook (fast) OR re-prompt loop (all harnesses)" |
| **Live eval** | Builtin only (easy path, 1.000/1.000) | **External-shaped agent (hard path, 0.933)** — forced via sandbox rewrite, non-vacuous |
| **Founding requirement** | "uniform across harnesses" — unmet for external | "uniform across harnesses" — verified live on actual external non-Claude |
| **Test scope** | Mock + builtin harness | **Real external harness (not-mock, not-builtin)** + builtin + mock |
| **Lines of code** | ~300 (v2 gates + two-tier) | ~450 (session-provisioning rewrite + re-prompt loop + external eval) |

### What the Gates (r1) Caught — and How It Mattered

**Architecture-critique round 1 (5/9 → NEEDS-REVISION):** The plan claimed forcing would reach CLI agents via `config.messages` + a prompt arg that **does not exist** in the CLI adapter. Reviewer **independently re-read every adapter** (not taking assertions) and found:
- `cli-harness-adapter.ts:207-208` spawns with `cwd: config.sandboxPath`
- The template set is ONLY `{{sandbox}} {{model}} {{apiKey}} {{baseUrl}} {{mcpUrl}}` (`:35`, `:186-190`)
- **Zero prompt arg, zero `config.messages` read anywhere in the file** (grep: 0 hits)
- Agent's only instruction channel IS the sandbox instruction file

**This is the exact same class of hole as v2:** "forcing that doesn't reach the external model." v1 and v2 both made it through `/review` because the gates verified the code STRUCTURE (did it compile? did tests pass?) not the code SEMANTICS ("does this mechanism actually touch the model?"). v3-r1 _would_ have shipped the hole — and would have been founder-rejected AGAIN — if critique had not independently verified claims against source.

**The fix (v3-r2):** Redesign the carrier as the **sandbox file rewrite** (`writeSandboxAgentsMd(sandboxPath, assembled_prompt + FORCING_MESSAGE)` + a second `startSession` that re-reads the same file). Verified against source: `context-assembly-prompt.ts:277-279` writes the file, every adapter spawns with `cwd: config.sandboxPath`, a re-spawn re-reads. This is a REAL carrier, proved by grep + code read, not assertion.

**Cost signal:** The plan took 2.5h (r1 → NEEDS-REVISION → revision design → r2 re-critique → APPROVED). A plan that falsifies itself costs a full critique cycle. If the first critique had been less careful (if the reviewer had _trusted_ the plan's "verified against code" assertions), the false plan would have shipped, founder would have rejected post-merge again, and AL6 would have needed a v4 re-architecture.

---

### What the Review (Independent) Verified

**Code review (Phase 4 — DONE):** An independent (non-self) reviewer walked the built code and confirmed:
1. The sandbox file is written with the forcing message + reason (`§2.3 "append the forcing message to the assembled prompt"`)
2. It is written BEFORE re-`startSession` in the loop (not after)
3. The loop bounds are enforced (`AL6_MAX_FORCE_RETURNS = 2`)
4. Cost caps and abort affordances survive the loop

**The fact that review was INDEPENDENT and happened after critique matters:** v1's gates (architecture-critique + review) both blessed the same flawed design because they reviewed the SAME plan. v3's critique caught the hole, revision fixed it, review verified the fix _against the built code_. The two-stage gate (critique → build → code-review) with different phases is the thing that caught and held the line.

---

### What the Live Eval Proved (The Hard Path)

**Scenario: `fr-forced-return-external` (external-shaped harness, `hasNativeReturnHook:false`)**

Agent: deepseek-v4-pro (a _real_ LLM, not Claude SDK, not builtin, not mock)
Harness: external-shaped (`hasNativeReturnHook=false` → forces via Layer-B provisioning re-prompt loop only, no native hook shortcut)
Result: **0.933/1.000** (aggregate across 3 dimensions)

Breakdown:
- `force_return_injected` (the proof): **1.0** — "2 Layer-B loop re-engagements recorded. External agent was forced via sandbox-file rewrite (not builtin shortcut)."
- `return_eventually_called_or_not_returned`: **0.8** — Agent remained stubborn even after forcing; outcome settled to `not_returned` (rejection, not return). The forcing DID reach the agent (so dimension 1 is 1.0), but the agent refused to comply. The score is 0.8 because "not forcing budget spent, external agent still refused" is a partial success.
- `not_silently_completed` (regression guard): **1.0** — Outcome is correctly `not_returned`, not the v1 silent-`completed` bug.

**What this proves:**
- Forcing _did_ reach a real external non-Claude agent (dimension 1 scored 1.0)
- The carrier (sandbox-file rewrite) is real, not a mock artifact (the judge keyed off `forceReturnCount >= 1`)
- The loop fired exactly twice (per the "2 re-engagements" note) and then settled (honoring AL6_MAX_FORCE_RETURNS = 2)
- The agent's refusal is a _real agent choice_, not a test harness artifact
- Cost: ~$0.009 (0 cents recorded in eval-results, but deepseek-v4-pro ~$0.004/1K prompt, ~$0.016/1K completion → ~3 tokens × 252 completion ~= $0.004 per run × 2–3 runs ~= $0.01 order of magnitude)

**Contrast to v2's eval:** v2 ran `force-return` on the builtin harness (the easy in-process path with direct drain interception). It scored 1.000 because builtin is a synchronous loop inside the same process. The external path (the actual requirement of "uniform across harnesses") never ran in v2 — so a 1.000 score on builtin gave false confidence while the harder path remained unproven.

**Residual gap:** The eval is non-vacuous but the agent's stubbornness (refusing to return even after being forced) means the "final return" did not happen. This is HONEST — the eval proves the forcing mechanism works (dimension 1), but the agent chose not to comply (dimension 2 score < 1.0). The project's tolerance for "non-return despite forcing" is a separate product call (do we accept agents that are stubborn even when forced?). AC4 does not demand forced-return success, only that forcing is uniform and exercised — both are met.

---

### What Survived the Multi-Spawn API Outage

**Context:** During the build phase (GREEN), the provisioning re-prompt loop triggers multiple `startSession` calls in one turn-span. During the v3 test runs, the Anthropic API experienced a 5xx outage mid-test.

**Observation:** The builders resumed from committed task boundaries. The turn had multiple `startSession` spawns as part of the re-prompt loop; when a spawn died server-side, the turn did not rollback or re-run from the beginning. Instead, it resumed from the next checkpoint.

**Significance:** This validates that the re-prompt loop design (multiple `startSession` calls per turn) plays well with the resume protocol. The builders did not have to invent a special case or add extra checkpointing — the existing committed task boundaries held. The multi-spawn design is durable to partial failures.

**Cost signal:** If v3 had not designed for multiple `startSession` calls, the API outage would have forced a full turn restart (larger re-run cost). The re-prompt loop cost is incurred upfront, so the resume protocol had to be robust to mid-loop failures. It was.

---

### What Went RIGHT in v3 (For Replication)

1. **Critique caught the fabricated carrier** — did not just read the plan's word that something was "verified against code," but independently re-read the code. This is the ONLY gate that caught the hole. The fix (v3-r2) was driven by the critique evidence, not hand-waving.

2. **Independent review after build** — a different agent reviewed the built code against the plan, not the plan against itself. This caught any slippage between "we will do X" and "we did X."

3. **Live eval exercised the WEAKEST/HARDEST member of the requirement set** — not the easy path (builtin native hook; v2 already proved that) but the external-shaped harness (no native hook, forced via provisioning loop). This is the path the founder was skeptical about. Proving it live, with a real external LLM, is the credible evidence.

4. **Commit + resume protocol survived multi-spawn** — the re-prompt loop's N `startSession` calls integrate cleanly with the existing abort/resume machinery. No special cases, no new complexity.

5. **Evaluation dimension fidelity** — the eval judges read `forceReturnCount` and gated on it being >= 1 (not mocking it), so a dead carrier would have failed the eval, not passed it vacuously. The eval can't be gamed by the test harness.

---

### What Went WRONG (Root Cause Clarity)

The three-version arc (v1, v2, v3) and two post-ship rejections (after v1, after v2) trace to a single root:

**No gate checked whether AC quantifications (e.g., "uniform across all harnesses") were met for EVERY member of the quantified set, only for the happy-path member.**

- v1: AC4 says "uniform forcing across CLI/sdk/isolated/builtin" → v1 only touches builtin → gate (critique) praised elegance, never asked "for all harnesses" → MISSED
- v2: AC4 same → v2 touches SDK + builtin (hooks) + others (reject) → founder rejects "not all can be forced" → gate should have enumerated the set → MISSED
- v3: AC4 same → v3 touches ALL → gate (critique) catches the carrier fabrication for the non-Claude harnesses, forcing a revision. This is the FIRST time the "all harnesses" requirement drove a gate decision.

**The pattern:** Gates verify mechanism WITHIN a chosen scope, not whether the scope is large enough. A critique that says "this is a correct observer for the drain" (✓) but doesn't ask "does this observer cover all four harnesses the AC requires?" (✗) is optimizing inside the wrong box.

---

### Candidate `/compound` Pattern #4: AC Quantification Enumeration Gate

**Pattern (NEW):** When an AC quantifies over a SET (all harnesses, all roles, every X), the gates do NOT verify the mechanism for each set member, only the happy-path one. A mechanism that is correct for one harness and insufficient for others passes gates and fails post-merge.

**Signal:** AL6 v1/v2/v3 is the signal. v1 scoped to builtin (but AC demands "all"). v2 scoped to Claude/builtin (but AC demands "all"). v3 finally touches all. Only critique v3-r1 (catching the fabricated carrier) forced the set-wide enumeration to matter. If the carrier had not been fabricated, a v3-r1 APPROVED (despite being wrong for CLI) would have shipped again.

**Fix candidate:** When `/architecture-critique` encounters an AC with quantification language (e.g., "all harnesses," "regardless of which," "every role"), explicitly:
- Enumerate the set (CLI, SDK, isolated, remote, builtin — or whatever the AC names)
- For EACH member, ask: "Does this design satisfy the AC for this member, or does it degrade?"
- If any member degrades, the design either (a) has a justification scoped to that member, or (b) is under-specified and needs revision
- If the design is "force for some, reject for others," that's a valid tradeoff — but call it out explicitly and check if the AC allows it

**Frequency:** ~3–5 occurrences per year likely (any "uniform," "all," "regardless" AC touches this). AL6 is the running example; review-routing ACs (AL2-style) likely have this; agent-identity and role-scoped ACs likely have this.

**Evidence base:** AL6 v1 critique (8/10, no enumeration → missed scope gap), v2 critique (critique existed? unclear; if it did, missed scope gap), v3-r1 critique (found fabrication, which FORCED scope enumeration, which caught the gap in the carrier per harness). The gate worked retroactively only because a different failure (fabrication) made scope enumeration necessary. A scope-first gate would have caught v1.

---

## Summary: Three-Version Cost + Process Findings

**Cost of v1 + v2 + v3 combined:**
- v1: ~3.5h (full pipeline, under-delivery, shipped, founder-rejected)
- v2: ~4h (re-architecture, critique, review, shipped, founder-rejected)
- v3: ~5.5h (two-round critique, revision, build, review, approved + shipped; plus cost of the extra critique round)
- **Total: ~13h + two post-merge rejections + one external live eval run**

**Earliest breakpoint for each failure:**
- v1: AC-quantification gate at critique (enumerate "all harnesses" → would catch "builtin only") — would have triggered revision in hour 2–3, saving ~1h of redundant work.
- v2: Same gate + live-eval gate (require external eval before approve) — would have surfaced the external path unproven, triggered revision in hour 3–4, saved ~3h of build + review.
- v3: Critique's fabrication-catch was the ONLY thing that worked. No earlier gate prevented the plan; critique's code-read did.

**The winning gate combination (proven in v3-r1 catch):**
1. **Code-read verification** — don't trust "verified against X," re-verify independently
2. **AC-quantification enumeration** — if AC says "all Y," check mechanism for each Y member
3. **Live-eval requirement** — agent-behavior ACs need proof on a real agent (not mock, not builtin-only)

**What should happen next (for `/compound`):**

The three candidate patterns from the v1/v2 retro are CONFIRMED by v3. Additionally, v3-r1 (critique catch via code-read) and the AC-quantification gap are a FOURTH candidate. Recommend:
1. Integrate AC-quantification enumeration into `/architecture-critique` as a mandatory check when "all/every/regardless/uniform" language appears in AC
2. Code-read verification (re-verify claims against source) as a mandatory critique step for ANY architecture plan that gates enforcement, interception, or forcing
3. Live-eval requirement enforcement at `/ship` gate — block if agent-behavior AC has no passing eval in build artifacts
4. External hard-path eval for "uniform across harnesses" ACs — evaluate the simplest non-preferred harness, not the easy one

---


## v4 — The Mock-Validation Trap and Real-Harness Testing Convergence

### What v4 Did (and Why It Failed at First)

| Aspect | v3 | v4 |
|---|---|---|
| **Mechanism** | Re-prompt loop + sandbox-file rewrite (Layer B) | **Per-harness native hooks** (Claude Stop hook + Codex hooks.json) + process-reengage (OpenCode) + in-process loop (builtin) provisioned by HyperIdle at session startup |
| **Adjudication** | Sandbox-file rewrite as universal carrier | Per-session HTTP bridge with MCP-routed `/return-status` adjudicator; shared singleton `enforcementRegistry` for all harnesses |
| **Harness scope** | All (but via single Layer-B re-prompt mechanism) | All, each using its native enforcement: Stop hooks (Claude, Codex), process re-engage (OpenCode), in-process loop (builtin) |
| **Provisioning** | Monolithic `session-provisioning.ts` | Per-harness at `provision-return-hook.ts` + `cli-harness-adapter.ts` + shared adjudication registry |
| **Live eval** | External non-Claude (deepseek, 0.933/1.0) | Same external path (testing the hardest path for each harness) |
| **Lines of code** | ~450 | ~800 (provisioning + re-engage + adjudication + multi-harness bridge) |
| **Gates passed** | Architecture-critique 8/9 → 9/9; code-review DONE | Code-review rounds 1–4: three NOT DONE → final DONE |

### The Four Rounds and The Mock-Validation Trap

#### Round 1: The Dead Endpoint (Hook Routes to 404)

**Review verdict: NOT DONE (5 CRITs)**

The implementation wired hooks and a bridge but the link was severed:
- Claude/Codex Stop hooks POSTed to `/api/mcp/<token>/return-status`
- The router only matched `/api/mcp/<token>` (exact) → the `/return-status` segment 404ed
- No route existed; `hyperidle_return_status` was only an MCP tool, not an HTTP endpoint

**The trap:** The "FULL BINARY PROOF" tests (`AL6-real-harness-return-enforcement.integration.test.ts`) spawned the *real* claude/codex binaries (not stubs), but:
- They provisioned a mock HTTP server (`startBridgeServer()`) with an invented `POST /return-status` protocol
- The real hook curled the mock, got a `callCount>=1` assertion
- This proved "the binary fires a Stop hook that can curl *some* server"
- It did NOT prove the hook reaches HyperIdle's adjudicator (it didn't; it got 404 in production)

**Core failure:** The test passed against a **mock that matches a protocol the test itself invented**, not the real server. A test that invents the server and the protocol, then validates the implementation against that, is a tautology — it proves implementation-matches-test, not implementation-matches-reality.

**Discriminator:** If the test had pointed the hook at the real server (`app` fixture) with no mock, it would have failed (404). Instead, the mock stood in, and both the test and the implementation were satisfied with an invented contract.

#### Round 2: The Mock Is Deleted But Still Present (Proof Without Loop)

**Review verdict: NOT DONE (CRIT-1/2/3 unproven, CRIT-4 fixed)**

Fixes: Added the real `/return-status` route; removed the mock server setup.

**New trap — same class:** The real route now existed and was wired. The tests were deleted and retaken against `startRealServer()` which mounted the real route. But the binary-proof tests STILL used `startBridgeServer` (now a different mock implementation). Oh wait, actually they still did not use the real app. The tests asserted `bridge.callCount>=1` where `bridge = startBridgeServer()` — a locally-instantiated HTTP mock listening on a different port.

Wait, let me re-read round 2. It says the mock was NOT deleted in round 2, it remained. Round 2 verdict is: loop wired but proven only vs mock.

**The decisive issue:** The production route was wired in code but the binary-proof tests never exercised it. The fake `startBridgeServer` mock sat between the real binary and the real server. This is the "tunnel of lies" — the test validates a path that bypasses production.

#### Round 3: Opening the Tunnel — Three Harnesses Fixed, One Remains Broken

**Review verdict: NOT DONE (opencode re-engage malformed, test masks via fabricated config)**

Fixes: Deleted the mock; real-harness tests now use `startRealServer()` mounting the real route. claude/codex FULL BINARY PROOFS assert against the real `enforcementRegistry` (not a mock `callCount`). The route now goes to the real HyperIdle server.

**New trap — this one specific to opencode:** The opencode re-engage loop is now real code (`:513-599` in the adapter), but the test drives a **fabricated config**:
- Production config: `["--dir", "{{sandbox}}"]` (from `CLI_TOOL_CONFIGS.opencode` at `adapter-pool.ts:376`)
- Test config: `["run", "--format", "json"]` (from `makeProcessReEngageConfig()` at test line 44)

The production path builds: `["--dir", ""].filter(length>0)` (empty string dropped, `--dir` becomes a standalone stray arg, forcing message appended as positional) — **malformed, no `run` subcommand.**

The test re-engage path builds: `["run", forceMsg, "--format", "json"]` — **correct, matches real opencode invocation.**

A real opencode re-engage in production would either crash (no `run` subcommand) or deliver the forcing message incorrectly. The test never exercised the production path; it used a working but different shape. **Same root failure as round 1:** test validates against a shape that isn't what ships.

**Sanity-break evidence:** Reviewer reverted the real fix (removed the `run` construction) → 2 out of 6 unit tests FAILED with `AssertionError: expected "--dir" to be "run"`. The test DID discriminate, but only when pointed at the real path. Round 3 had left it pointed at a fabricated path, passing vacuously.

#### Round 4: Closing All Tunnels (DONE)

**Review verdict: DONE**

Fixes:
1. Fixed opencode re-engage invocation: production now builds `["run", forceMsg, "--format", "json", "--pure", "--model", model]` — the correct shape, every arg present
2. Updated the unit test to import and use the REAL `CLI_TOOL_CONFIGS.opencode` (the `["--dir", "{{sandbox}}"]` shape), not a fabricated shape
3. Updated the integration test to spawn the real binary with the production-shaped args

**Sanity-break (final):** Reverted the fix to the old broken code → exactly 2/6 unit tests FAILED; verified the test discriminates the real defect. Restored; all 6 pass.

**Per-harness proof status (final):**
- **claude:** Real binary → real Stop hook → real `/return-status` route → real `enforcementRegistry` → `forceCount>=1` from hook fire, NO mock. Fails if route 404s.
- **codex:** Real binary + per-session `CODEX_HOME` → real hooks.json Stop hook → same real route + registry. Fails if hook call path breaks.
- **opencode:** Real binary (spawned) → real re-engage invocation (`run` subcommand present) → real registry increment in adapter loop (unit test with injected spawn, real config) + real binary acceptance of the full invocation (integration test spawn). Unit test fails if invocation malformed; integration fails if binary rejects it.
- **builtin:** In-process (not spawnable) → real in-process forcing loop → real registry → `forceCount>=1` from loop fire (no drain fallback). Fails if loop is decorative.

No mock. No fabricated config. All four harnesses proven end-to-end.

---

### Why This Matters: The Mock-Validation Trap (New Pattern, High Frequency)

**Pattern:** A test suite passes because it validates implementation against a mock/stub that matches a **contract the test itself invented**, not the real contract the system enforces.

Symptoms:
- Test invents or provides a `startMockServer()` that speaks a protocol
- Implementation talks to the mock and gets expected responses
- Test asserts "contract fulfilled" — e.g., `callCount>=1`
- Real system's contract (the one shipped code relies on) differs or is missing entirely
- Real production code would fail, but the test doesn't touch it

**Root cause:** Separation of concerns is inverted. The test should prove "implementation + real system work together"; instead it proves "implementation matches test's idea of the system."

**Discriminator:** If you remove the real server (or the real link to it), do all the tests still pass?
- **v4 round 1/2:** Yes — the mock server still runs, tests still pass, real 404 endpoint never touched.
- **v4 round 3 opencode:** Yes — test used a fabricated config that isn't what ships; the real (broken) config never tested.
- **v4 round 4:** No (after fix) — revert the production fix → tests FAIL. The test now discriminates reality.

**The sanity-break:** The reviewer performed a decisive check in round 3 and round 4: nullify a key production link (disable the real route registry read in round 3; revert the opencode fix in round 4) → tests that claimed success went red. That's the proof the test is real.

**Candidate `/compound` process improvement:**
For any AC that reads "X calls Y and Y adjudicates," require:
1. The test exercises the REAL Y (shipped implementation, not mock)
2. The test includes a sanity-break: remove/nullify the real Y → test FAILS
3. Real and test use the SAME configuration/contract (no fabricated shape that "works in test")
4. The test is flagged as "NOT DONE" until sanity-break is verified

---

### What Went RIGHT: The Convergence (For Replication)

**1. Independent review across four rounds with escalating rigor.**
- Round 1: "The route is dead." Reviewer checked the router code against the hook POST target; 404 found.
- Round 2: "The loop is wired but proven only vs mock." Reviewer questioned why the real binary test used a mock server; traced the proof and found it didn't touch the real route.
- Round 3: "The opencode test masks the production defect." Reviewer compared the test config shape against the shipped config shape and found divergence; sanity-break confirmed the production invocation was broken.
- Round 4: "All harnesses proven end-to-end." Reviewer verified that reverts of each fix caused the corresponding test to fail — the test was real.

The escalation across four rounds was not a process failure — it was the process WORKING CORRECTLY. Each round was necessary because the failure mode changed: round 1 was a missing route; round 2 was a mock proxy; round 3 was a fabricated config. A single review gate (one-and-done) would have missed the evolving gap.

**2. Sanity-break discipline became the gate.**
The founder's feedback: "do proper testing; don't assume." This translated into: "break something real, show that tests go red." By round 4, every fix was verified by a targeted revert. This is the TEST-IS-REAL discriminator.

**3. Real-harness binary tests (not stubs, not scripted).**
v4 spawned real `claude`/`codex`/`opencode` binaries headless (process isolation: `buildCleanEnv` stripped `CLAUDECODE`, `spawnDetached` in its own process group) and validated against a REAL live LLM (internal API for claude/codex; external for opencode). The "lives only in Claude Code" framing was wrong; the issue was "we never tested the shipped invocation." Once the real paths were tested, the defects surfaced.

**4. The drain-gate floor as the un-bypassable backstop.**
At every layer, if the native mechanism (hook, re-engage, loop) failed or was silent, the gate persisted `not_returned` and emitted the event. This meant:
- Round 1: Even with a dead route, the outcome was never silently `completed`
- Round 2: The gate still held if the hook didn't fire
- Round 3: The gate still held if opencode invocation was broken
- Round 4: The gate is the catchall, but now the native mechanism is proven to fire first

The backup was genuine. This is what prevented the "looks enforced but isn't" pattern from leaking to production.

---

### The Cost (5 Versions, 4 Rejections, 4 Review Rounds)

- **v1:** 3.5h (full pipeline, under-delivery, rejected post-merge)
- **v2:** 4h (re-architecture, rejected post-merge)
- **v3:** 5.5h (two-round critique + approval, shipped)
- **v4:** 6h (architecture critique approved, code review round 4: 3 NOT DONE → DONE, shipped)
- **Total:** ~19h + two post-merge rejections + one external live eval (0.933/1.0) + four code review cycles

**Earliest breakpoint (hypothetical):**
- If round 1 review had required "real server, sanity-break verified": DONE in round 1. Cost: ~2h additional to fix the dead route. Total: ~5.5h, no post-merge risk.
- If mock-validation trap was a known pattern enforced at gate entry (v1): "A test must not invent the adjudicator protocol; the real system defines it." Cost: ~1h design revision in v1. Total: ~2h for all of v1, no v2 needed.

**What made v4 finally work:**
1. Independent review + escalating rigor (four rounds, different angles each time)
2. Sanity-break discipline (each fix verified by a targeted revert)
3. Real binary spawning + real adjudication flow (not stubs, not mocks)
4. The gate as the un-bypassable floor (nothing slips to `completed`)

---

### Mapped to `/compound` Candidates (Merged with v1/v2/v3)

The five-version, four-rejection arc shows **three distinct gate gaps and one shared root:**

#### 1a. Strongest-AC-Reading Audit in Critique (CONFIRMED in v4)

**v4 signal:** AC4 says "enforce uniformly across all harnesses." v4 round 1 wired one harness (Claude) with a dead route, one harness (Codex) with no integration test, one harness (OpenCode) with a fabricated test config, one harness (Builtin) correctly. The critique gate (architecture) did not enumerate the set and check each. If it had, the non-uniform coverage would have triggered a revision.

**Frequency:** Every enforcement/integration WP. AL6 alone is three instances (v1: builtin-only; v2: Claude+builtin; v3/v4: all-harnesses claim but each needs checking).

#### 2. Mock-Validation Trap (NEW, high-value)

**Pattern:** A test invents the adjudicator protocol/shape, validates against it, and claims success — but the real system defines a different protocol.

**Signals:**
- v4 round 1: Test setup includes `startBridgeServer()` (invented protocol) that isn't what the real route implements
- v4 round 3: Test config shape (`["run", "json"]`) differs from shipped config (`["--dir", ""]`)

**Root cause:** Integration tests for "X calls Y and Y adjudicates" often use a test double for Y. If Y is the test's own stub, the contract is invented by the test. If Y is shipped code, the contract is real.

**Discriminator:** Sanity-break — remove/nullify the real Y, tests should fail. If they don't, Y was mocked/fabricated.

**Candidate fix:** For enforcement WPs, require:
- Every integration test that validates "X → Y" must use the REAL Y shipped code (not a mock, not a test stub)
- Each test must include a sanity-break: nullify Y or revert the fix → test FAILS
- The sanity-break must be VERIFIED in the review (not just claimed)

**Frequency:** ~5+/year (any "X adjudicates / X enforces / X routes" AC).

**Evidence base:** AL6 v4 is the proof. Round 1 mock, round 3 config fabrication, round 4 fix verified by sanity-break — three instances in one WP.

#### 3. Real-Harness Testing (Operational Dependency, Not a Critique Gap)

**Pattern:** The implementation is correct but is never tested against the real dependencies (real binaries, real adjudication servers, real config shapes). Tests pass in isolation but fail in production.

**v4 signal:**
- Round 1/2: Real binary (claude) spawned, but mock server stood in for adjudication
- Round 3: Real binary (opencode), but test config differed from shipped config
- Round 4: Real binary + real server + real config + sanity-break verified

**Candidate fix:** When a WP integrates with external tools (CLI binaries, APIs, routes), require:
- At least one integration lane must spawn the REAL tool (not a stub, not a mock server standing in)
- The lane must use the SHIPPED config/args (not a test-fabricated shape)
- The lane must be gated for CI (skip if tool not installed/authenticated)
- The lane must include proof that it exercises the real path (e.g., sanity-break)

**Frequency:** ~5+/year (any integration with external tools).

#### 4. AC Quantification Enumeration (CONFIRMED in v4, distinct from v3)

**Pattern (from v3, confirmed in v4):** When AC says "all X" or "uniform Y," gates do not verify the mechanism for EACH member of the set.

**v4 signal:** AC4 "enforce uniformly across all harnesses" → gates never asked "is enforcement uniform for claude? codex? opencode? builtin?" Instead they asked "is enforcement wired?" When the clause "wired in code" was confused with "wired for each harness," the set-wide verification got skipped. Round-1 critique should have enumerated the four harnesses, checked each, and found three had 404s or fabricated tests.

**Frequency:** ~3–5/year (any "all," "uniform," "regardless" AC).

**Candidate fix:** When `/architecture-critique` encounters quantification language, explicitly enumerate the set (e.g., "all harnesses: claude, codex, opencode, builtin") and ask for EACH member: "Does this design satisfy AC for this member, or degrade?" Require a per-member verdict.

---

### Summary for `/compound`

**New candidate (high-value, root cause of ALL four cycles):** Mock-Validation Trap — tests that invent and validate against a contract not enforced by the real system.

**Confirmed candidates (present in v1/v2/v3, amplified in v4):**
1. **Strongest-AC-reading audit:** Critique did not challenge whether "enforced uniformly" meant "for each harness" (it should have).
2. **AC quantification enumeration:** When AC names a set, gates must check per-member, not just happy-path.
3. **Real-harness testing discipline:** Integration proofs must use real dependencies, real config, sanity-breaks verified.

**Cost of enforcing one pattern at gate entry:**
- Mock-validation trap detected at review round 1: "Your test invents `startBridgeServer` but production doesn't implement it. Point to the real route or add the route." → 1h fix, no round 2–4 needed. Savings: ~5h.
- AC quantification at architecture-critique round 1: "For 'enforce uniformly across all harnesses,' check codex/opencode/builtin, not just claude." → 0.5h enumeration, catches the gaps early. Savings: ~3h (fewer discovery cycles).

**The winning gate combination (v4 proved):** Code-read verification + sanity-break discipline + independent review escalation. No single gate prevents all trap shapes; the combo converged v4.

---

