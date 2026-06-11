# AF11 — Authorization & credential hardening: Retro

**Date:** 2026-06-11  
**Workpackage:** AF11 — Authorization and credential hardening  
**Pipeline phase:** Post-build (Phase 4 code review round 2 → DONE)  
**Verdict:** Completed. 3 CRITICAL holes found and closed via live adversarial testing. 7 ACs PASS.

---

## Summary

AF11 delivered a security retrofit that closes the same class of bug recurring 3 times in prior work (header-derived identity bypass of authorization). The audit found 3 CRITICAL holes in the first code-review round, all reproduced *live during review*. The builder fixed all three + root-cause masking (a silenced ESLint rule). No follow-up build cycles were needed after round 2 re-verification; once fixed, all 123 touched integration tests green on first pass.

The workpackage cost signal: **architecture critique took 2 rounds (round 1 CRITICAL on an enumeration miss), code review took 2 rounds (round 1 found live exploits, round 2 verified closure), but implementation green was first-pass once the fixes were applied.**

---

## Key observations (tagged by compoundCandidates)

### Success: Live adversarial testing proves holes were real, not false positives

**Type:** success  
**Severity:** high  
**Tags:** [security-testing, regression-proof, code-review]  
**Observation:** The reviewer on AF11 code-review round 1 did not merely lint or grep for the holes the architecture promised. Instead, the reviewer *authenticated a test principal, crafted exploit requests with spoofed headers, and captured the payload returned from the API.* The CRITICAL-1 hole (thread-resolve route reads `X-Identity` header) was proven by: "attacker as principal A, request with `X-Identity: vic-B` → response returns victim B's assistant thread + all messages." Same proof applied to message-forge and inbox-senderId paths. Then the reviewer *reverted source to pre-fix state and re-ran the same tests* — all 5 fail (403 → 201, actual thread → victim's thread). This is the highest-confidence negative test any review has produced on this surface. The builder never has to wonder if the fix was surgical or a placebo; the proof is airtight.

**Lesson candidate:** For security WPs, "verify passes" is necessary but NOT sufficient — the AC tests must exercise the exploit, and a root-cause (header-as-authz-subject) must be systematically swept. The built-in regression suite (AF11-idor-regression.integration.test.ts with 5 tests) now prevents the same family of holes from re-appearing.

**Compound reference:** This observation aligns with CC-009 (multi-agent review finds non-overlapping bugs) — the code reviewer working independently from the architect found the holes the architect's static reading of the code missed. Confirms the multi-review practice.

---

### Friction: Architecture critique round 1 missed `/team-members` route — enumeration not mechanically derived

**Type:** friction / gap  
**Severity:** high  
**Tags:** [enumeration-miss, architecture-critique, rework, checklist-rigor]  
**Observation:** The architecture checklist promised "41 handler-level data-route groups" and listed 40 rows. The `/team-members` route mounted in app.ts:386 was absent from both the checklist and the exempt block. The CRITICAL finding on round 1: "the 40-route closure is false; the default-deny flip (step 10) depends on every data route declaring. A missed route will either (a) slip through the lint allowlist because the checklist forgot it, or (b) 403 at the flip if the runtime assertion catches it. Either way, 'every data route declares' is unproven." **Root cause:** the checklist was written by reading the architect's mental count, not by mechanically `grep`-ing app.ts mounts and reconciling line-by-line. The critique correctly mandated re-derivation: "engineer must re-derive the list from the mount table, not trust the 40 rows." The architect fixed it in round 2, verified every mounted group by running the grep themselves, and cited line numbers.

**Lesson candidate:** Exhaustive-retrofit checklists (enumerating surfaces where a property must hold, such as "every data route declares a boundary") must be *mechanically derived* from the authoritative source (app.ts mount table, not a hand-count). The derivation procedure itself must be repeatable by the engineer — grep/reconcile/cite — so the flip-gate in the plan can re-run it and confirm nothing is missing at step 10. Hand-counted enumerations (even 40/41 is close) are a structural weak point when the count is a load-bearing prerequisite for default-deny.

**Compound reference:** CC-007 (spec/reality drift discovered at plan time) — the manual enumeration is a plan-to-code drift risk. The fix (enumerate mechanically from grep) prevents future "we forgot to checklist X" misses.

---

### Friction: Code review round 1 found 3 CRITICAL holes; builder had silenced the ESLint rule that would have caught one of them

**Type:** friction / gap  
**Severity:** critical  
**Tags:** [eslint-suppression, mask-regression, security-regression, authz]  
**Observation:** CRITICAL-2 (POST `/api/threads/:id/messages` forges participant identity via `X-Identity` header) was identified by the custom ESLint rule `authz/no-raw-db-in-route-bypassing-policy` — a rule this WP *built to prevent exactly this pattern* (raw DB write in an enforced route without routing through the chokepoint). The builder's commit **suppressed the rule with a `// eslint-disable-next-line authz/no-raw-db-in-route-bypassing-policy` comment** whose justification was "custom participant guard is the authz" — but the guard validates a *client-supplied* header value, not the authenticated principal. The suppression was materially false, and it masked the very regression gate the WP designed to prevent. **The security posture was: rule fires correctly, developer suppresses it with incorrect reasoning, reviewer audits the live exploit, builder removes the suppress and fixes the code, rule now passes.** 

**Lesson candidate:** An `eslint-disable` of a security-regression rule should be itself a review red-flag, and the justification must survive adversarial scrutiny (not just claim + commit). More broadly: ESLint rules that enforce security invariants (like "no-raw-db-in-route-bypassing-policy") are defensive infrastructure; any suppression is a signal that the route's authz is non-obvious. The builder should have felt friction when typing the disable comment — and the reviewer absolutely needs to audit the justification's truthfulness, not assume it reflects the code.

**Compound reference:** This is a sub-case of CC-003 (ACs are happy-path; security cases land via review only). The rule exists; the builder suppressed it; the test suite passed (no test exercised the exploit). Only adversarial live testing during review caught it.

---

### Friction: AC2 test suite did not exercise the holes the AC claimed to close

**Type:** friction / gap  
**Severity:** high  
**Tags:** [test-coverage-gap, ac-comprehensiveness, regression-test]  
**Observation:** AC2 ("Assistant guard from Principal, not header") had test coverage for the soul-prompt GET/PATCH endpoints, which *were* fixed by the architect and passed their tests. But AC2 also promised to close `GET /api/threads/assistant` (thread-resolve route) and `GET /api/threads/coach` — both of which use the same `readSenderId` helper and fail to `c.get("userId")`. The AC2 test block did not exercise these routes, so the hole remained open and green-light passed. **The test suite proved the builder's implementation matches the happy-path spec, not that the spec's happy path covers the holes.** The reviewer wrote inline tests during the code-review session (crafting exploit payloads), found the holes, and those tests were then added as a permanent regression suite. Retro evidence: the new AF11-idor-regression.integration.test.ts file would have caught this on first run if it had existed before the build phase.

**Lesson candidate:** ACs that promise "close a hole in endpoint X" must ship regression tests that reproduce the hole's behavior (the exploit) and assert it fails on the pre-fix code, succeeds on the post-fix code. The test is the anti-pattern, not the happy path. This aligns with the pattern CC-004 (wiring gap — tests prove behavior but not production paths) and CC-004's fix: "every AC that produces/consumes a route must show one test that drives the production entrypoint." For security ACs, the entrypoint is the vulnerability being closed.

**Compound reference:** CC-004 (production wiring gap) — the AF11 AC2 test suite proved the soul-prompt route works, but not that the thread-resolve route is gated. The rule "drive the production entrypoint" must include "for security ACs, the exploit-closure is the entrypoint."

---

### Success: Architecture critique round 2 verified findings with independent grep/read, not trust

**Type:** success  
**Severity:** low  
**Tags:** [architecture-critique, code-verification, rigor]  
**Observation:** The architecture critique round 2 (after round-1 CRITICAL on `/team-members` miss) re-verified every code claim by running the grep themselves, reading the source, and citing file:line. E.g., "round 1 claimed only `sessions-routes.ts:249` reads plaintext `apiKey`; I grepped and found `server-factory.ts:41` also reads it — a second decrypt site." The revision caught an error the architect had missed (two `resolveModelTier` call sites needing decrypt, not one), which the architect then fixed in the plan. **The reviewer did not review the designer's word; they audited the facts.** This prevented the builder from discovering post-implementation that the "single decrypt point" was actually two sites.

**Lesson candidate:** Architecture-critique skill must include a required step: "Audit every load-bearing factual claim (table size, mounted routes, provider read locations, schema column presence) by independent grep/read; cite file:line; if reality differs from claim, flag it as a finding to resolve."

**Compound reference:** CC-007 (spec/reality drift) and CC-009 (multi-agent review finds non-overlapping bugs). The independent audit is what makes critique's adversarial lens sharp. This confirms the multi-review practice is protecting against drift.

---

### Observation: Two code-review rounds were needed; round-1 not-done → immediate round-2 re-review

**Type:** observation / cost-signal  
**Severity:** medium  
**Tags:** [code-review, two-round, rework-signal]  
**Observation:** Round 1 review returned NOT DONE with 3 CRITICAL + 2 WARNING findings. The builder fixed all 5 items in a single commit. Round 2 re-reviewed the same files and returned DONE with zero open findings. Unlike prior workpackages where round-1 "NOT DONE" signals re-planning or architecture rework, AF11's round-1 holes were straightforward once identified: swap `readSenderId` for `c.get("userId")` in 4 routes, remove an `eslint-disable`, add regression tests. **Cost:** 1 additional code-review cycle, but the builder's turn-around time was <24h. The holes were not conceptual misunderstandings; they were implementation oversights (using the wrong identity source in two routes + masking the lint gate).

**Lesson candidate (none — this is normal):** The two-round pattern is expected for security-critical workpackages. The cost is paid once, upfront, rather than discovered post-deployment.

---

### Success: Regression test suite ensures future routes don't re-introduce the hole

**Type:** success  
**Severity:** low  
**Tags:** [regression-testing, preventive]  
**Observation:** AF11-idor-regression.integration.test.ts ships with 5 tests: two prove X-Identity header cannot override authentication for data scoping (threads/assistant + coach routes), one proves message-POST cannot use header-derived sender, one proves inbox POST derives senderId from principal, one proves deletion via X-Identity is rejected. If a future workpackage adds a new route and mistakenly uses `readSenderId(c)` for auth instead of `c.get("userId")`, the regression suite will catch it.

**Lesson candidate (none — success practice):** Permanent regression suites are a force-multiplier for preventing category-wide regressions. Every security WP should ship a regression suite that exercises the holes it closes.

---

### Cost signal: Build phase 3 (retrofit 40 routes with declarations) was rapid; flip (step 10) happened on schedule

**Type:** observation / cost-signal  
**Severity:** low  
**Tags:** [build-phase, default-deny-flip]  
**Observation:** Architecture promised stage 3 would mount `requireBoundary(...)` on all 41 route groups and required the flip (from warn to throw-in-dev) to happen only after step 9 confirmed every checklist route declares. The flip was placed in code as a mode switch in the middleware. Builder touched 30 route files, added 127 `requireBoundary` calls, verified against the checklist, and flipped the middleware. The full retrofit was completed in stage 3 without any routes slipping through — the lint rule + the static checklist acted as a closure mechanism. **Cost signal:** strict adherence to the ordered task list (concept → architecture → two-round-critique → red-phase tests → green-phase fix → two-round-code-review → flip-only-when-ready) ensured the default-deny contract was honored without the flip accidentally 403-ing legitimate traffic.

**Lesson candidate (none — process worked):** The mandated sequencing on AF11 is a template for future default-deny retrofits. Do not flip until all rows declare; enumerate mechanically, not by hand; verify audit the enumeration by re-running the derivation.

---

## Retro log entries

```json
{"date": "2026-06-11", "workpackage": "AF11", "type": "success", "observation": "Live adversarial testing during code review proved holes were real, not false positives. Reviewer authenticated as attacker principal, crafted spoofed requests, captured victim response. Then reverted source to pre-fix state and re-ran: all 5 tests failed as expected. Airtight negative proof.", "severity": "high", "tags": ["security-testing", "adversarial-code-review", "regression-proof"], "compoundCandidates": ["CC-009"]}
{"date": "2026-06-11", "workpackage": "AF11", "type": "friction", "observation": "Architecture checklist enumerated 40/41 routes by hand-count. `/team-members` mount present in app.ts but absent from checklist. CRITICAL: missed route would either slip through lint allowlist or 403 at flip. Root cause: enumeration not mechanically derived from grep. Fixed in round 2 by architect running grep + line-by-line reconciliation.", "severity": "high", "tags": ["enumeration-miss", "architecture-critique", "checklist-rigor", "mechanical-derivation"], "compoundCandidates": ["CC-007"]}
{"date": "2026-06-11", "workpackage": "AF11", "type": "friction", "observation": "Builder silenced ESLint rule authz/no-raw-db-in-route-bypassing-policy with false justification ('custom participant guard is authz' — but guard checks header-supplied value, not principal). Rule correctly identified CRITICAL-2 hole; suppress masked it. Builder removed suppress; route now passes rule legitimately via authorizeWrite().", "severity": "critical", "tags": ["eslint-suppression", "security-regression-masking", "authz"], "compoundCandidates": ["CC-003"]}
{"date": "2026-06-11", "workpackage": "AF11", "type": "gap", "observation": "AC2 test block covered soul-prompt routes that were fixed; did not cover GET /api/threads/assistant and GET /api/threads/coach routes that use same readSenderId() helper. Holes remained open and undetected. Test suite proved happy-path implementation, not that ACs' promised holes were closed.", "severity": "high", "tags": ["test-coverage-gap", "ac-comprehensiveness", "regression-test"], "compoundCandidates": ["CC-004"]}
{"date": "2026-06-11", "workpackage": "AF11", "type": "success", "observation": "Architecture critique round 2 verified code facts by independent grep/read, not by trusting architect's word. Found that 'single decrypt point' was actually two sites (server-factory:41 + sessions-routes:246). Architect revised plan. Prevented builder from discovering post-implementation.", "severity": "low", "tags": ["architecture-critique", "code-verification", "fact-audit"], "compoundCandidates": ["CC-007", "CC-009"]}
{"date": "2026-06-11", "workpackage": "AF11", "type": "observation", "observation": "Code review round 1 found 3 CRITICAL + 2 WARNING; round 2 re-reviewed after builder fixed all 5 items. Turn-around <24h. No conceptual rework needed — holes were implementation oversights (wrong identity source in 4 routes, masked lint gate, missing test coverage). Two-round pattern is expected for security-critical workpackages.", "severity": "medium", "tags": ["code-review", "two-round", "rework-signal"], "compoundCandidates": []}
{"date": "2026-06-11", "workpackage": "AF11", "type": "success", "observation": "Regression test suite AF11-idor-regression.integration.test.ts ships with 5 tests exercising header-spoof holes. Future routes that mistakenly use X-Identity for authorization will be caught. Permanent category-wide regression prevention.", "severity": "low", "tags": ["regression-testing", "preventive"], "compoundCandidates": []}
{"date": "2026-06-11", "workpackage": "AF11", "type": "observation", "observation": "Build phase 3 (retrofit 40 routes + flip) completed on schedule. Lint rule + checklist acted as closure gate. Flip only happened after every route declared. Strict task-list sequencing ensured default-deny contract was honored without over-restricting legitimate traffic. Template for future deny-by-default retrofits.", "severity": "low", "tags": ["build-phase", "default-deny-flip", "process-control"], "compoundCandidates": []}
```

---

## Cost analysis

| Phase | Estimate | Actual | Notes |
|-------|----------|--------|-------|
| Concept | — | 1 commit (locked from `docs/architecture/authorization-model.md`) | Pre-built, no rework. |
| Architecture | ~2–3 days | 3 commits + 2 critique rounds | Round 1 CRITICAL on `/team-members` miss; architect fixed + re-verified mechanically. |
| Architecture critique | ~1 day | 2 rounds (8/10 → 9/10) | Round 1 found enumeration miss + under-specified session-WS behavior + wording issues. Round 2 verified all facts via grep/read. |
| Write-tests | ~1 day | 1 commit (green) | Red-phase tests for all 7 ACs; 56 tests written before implementation. |
| Write-code | ~2–3 days | 2 commits (green + fix) | Initial green phase, then code review fixes (round 2). |
| Code review | ~2 days (1 round expected) | 2 rounds (4 days actual) | Round 1 found 3 CRITICAL + 2 WARNING (live adversarial testing). Round 2 verified all fixes, green. |
| **Total** | ~7–8 days | ~10 days | +25% cost from critique rework + code-review rework. Cost signals: hard-to-enumerate surfaces (40-route checklist) benefit from mechanical derivation; security ACs benefit from adversarial test writing (not happy-path only). |

---

## Escalations & open residuals

None. All 7 ACs PASS. No CRITICAL or WARNING findings in final code review. Regression suite in place.

---

## Recommendations for next security WP

1. **Enumerate mechanically, audit independently.** If the plan lists a checklist (route enumeration, security-control coverage), derive it from grep/read and cite line numbers. Have critique re-derive independently.
2. **Write regression tests that exercise the exploit, not the happy path.** AC: "close X hole" → test: authenticate as attacker, prove pre-fix response is vulnerable, prove post-fix response denies.
3. **Audit ESLint suppression justifications adversarially.** If a security rule is suppressed, the justification must survive scrutiny — not just claim that authz is handled elsewhere.
4. **Default-deny flips require all-clear on the checklist.** The flip is a gate, not a one-line code change. Condition it on step 9 (every route declares) being verified + audit-checked.

