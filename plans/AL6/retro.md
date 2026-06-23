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
