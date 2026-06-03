# X6 Retro

## Observations

### [process] Architecture critique caught 5 real bugs pre-implementation
The critique (7/10) identified: context window tracking using cumulative instead of latest inputTokens, missing HTTP timeout on LLM calls, no retry strategy for transient failures, tool definitions sourced from config.tools instead of registry, and resolvedModel null check gap. All 5 were genuine issues that would have caused runtime bugs. Critique value: HIGH.

### [process] Code review caught missing provisioning integration
Round 1 found that Task 7 (provisioning orchestrator integration) was never implemented — the adapter was registered in the pool but session-provisioning.ts and sessions-routes.ts were unchanged. Without this, the builtin adapter couldn't be used end-to-end. Also caught a timer leak in fetchWithTimeout and unsafe `as` casts. Review value: HIGH.

### [process] Single rework cycle resolved all findings
Builder applied all 5 fixes (3 blocking + 2 quality) in one round. Round 2 returned DONE. No unnecessary rework — the fix-verify cycle was efficient.

### [process] TDD discipline maintained
Tests written before implementation (66 failing, 7 passing constants). Builder then implemented to pass all 73 tests. No test-after-the-fact pattern.

### [quality] Plan reconciliation table prevented spec drift
The architecture plan's reconciliation table checked 11 assumptions against the codebase. This pattern should be standard for all workpackages — it catches drift before code is written.

### [quality] Test-to-implementation ratio is healthy
~1600 lines of tests for ~1900 lines of implementation (0.84 ratio). Tests cover all 15 ACs with specific assertions, not just smoke tests.

### [quality] Helper module split keeps main adapter focused
Three helper modules (llm-types.ts, llm-client.ts, context-window.ts) extracted format normalization, API calling, and context tracking from the main adapter file. Good module depth.

### [cost] Scope summary
10 commits. 4 new files + 6 modified files. ~3500 lines net new (1900 implementation + 1600 tests). 2 review rounds. Architecture critique score 7/10.

### [process] Spec validation scenario contradicts concept and plan
The spec says "before any tool calls are made" for the planning turn, but the concept and plan allow tool calls during planning (for context gathering). Builder followed the plan, which is the more rational design. The spec's validation scenario is overly restrictive — the planning turn needs to read context via tools before it can plan.

## Cost Signals
- Total commits: 10
- New files: 4
- Modified files: 6
- Lines added: ~3500
- Lines removed: ~40
- Review rounds: 2
- Architecture critique score: 7/10
- Builder rework: yes (1 round, all findings resolved)
