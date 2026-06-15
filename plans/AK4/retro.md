# AK4 Retro — The Assistant can draft and shape a bet

Fresh-context observations from the AK4 pipeline run (2026-06-15). Observe, don't fix.

## Outcome
Shipped: the Assistant holds a real back-and-forth and can draft an editable bet (goal + concept body) from the conversation, surfaced as a BetCard in the overlay; the founder reviews/edits/commits — never the Assistant. Conversational iteration updates the same draft. 4/4 ACs covered, proven through the real `runChatTurn → executeToolCalls` loop. 1 architecture-critique revise round (6/10→8/10), 1 code-review revise round (lint regression).

## Cost signals (A/B harness reads these)

1. **Spec-vs-reality drift caught at plan time (success, but a class signal).** The spec's "what exists today" claimed the Assistant "never replies" — but AH3 had already shipped `runAssistantTurn` earlier the same day. The spec was authored without reading AH3's code. The designer caught it in Phase 1 by reading the code over the spec, collapsing AK4 from "build a full Assistant session" to "wire a bounded tool-use loop." Class: specs written against perceived state, not verified-against-current-codebase state. Mitigation candidate: a reconciliation step that greps the claimed-missing surfaces before planning. (Compounds CC-007.)

2. **Architecture critique round 1 found 2 CRITICALs from false claims about existing code.** Plan claimed `SessionConfig.tools` was load-bearing (it's dead — adapter passes the whole `session.toolDefs`) and that `edit_bet` was registered for the assistant role (it wasn't — only in the dead `assistant-tools.ts` path). Neither was catchable by reading the plan's prose; the critique required independent grep/read. Success for multi-agent critique (CC-009), and a signal that architecture critiques must audit factual claims against code, not trust citations.

3. **Code review round 1 NOT DONE for a single lint-format regression the builder's own verify had reported green.** The task-8 commit widened an assertion to 21 tools but left the line unformatted; `biome check` was RED at review time though the builder claimed verify green. One-line `lint:fix` cost a full review round. Signal: builder's final verify/lint did not hold at push time (lint not re-run after the last edit, or run before it). Candidate: enforce `lint` as the last gate immediately before push.

4. **Never-silent cap-exhaustion was implemented correctly but was not free.** Plan specified cap=3 tool iterations with a persisted non-empty reply on cap hit; the existing path had only `if (text)` with an empty default. Task 1 built the explicit fallback + a test asserting ≤3 executions and a non-empty reply. The invariant is guaranteed by code, not by review alone.

5. **User Sovereignty enforced structurally, not theatrically (success — protect).** AC3b is a static unit assertion that the injected conversational registry is EXACTLY `["create_bet","edit_bet"]` with no commit/kill/ship tool anywhere. Clean, verifiable proof the model cannot breach the draft-only boundary. Pattern worth protecting (CC-009).

6. **TDD red-phase worked without rework (success — protect).** Integration (6) + registry unit (14) + web (7) tests written before implementation; all green on first green-phase run, no test rewrites. (CC-010.)

7. **Lore captured at decision points.** `@lore` comments documented the load-bearing decisions (dead `SessionConfig.tools`, two-hop team resolution, transcript-based draft binding) where they live. (CC-008.)

## Process notes
- L-complexity but small code surface (one new registry file + a bounded loop + an overlay card). Like AJ3, an "L-process/narrow-build" profile — the L letter over-provisioned. (Compounds the L-process vs L-build sub-tag candidate.)
- Designer/reviewer/builder persona separation held; SendMessage unavailable in harness, so each phase re-spawned with on-disk artifact context (no session reuse) — worked cleanly.
