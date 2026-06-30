# AR6 Retro — MCP-bridge / capabilities / enforcement consolidation

Fresh-context observation pass. Observe and record only — no fixes.

AR6 = honest-harness consolidation of the MCP-bridge / capabilities / enforcement
integration tests onto AR1's lane + AR2's real-run pattern.

## Observations

### 2026-06-30 — CC-004 recurrence INSIDE the very track built to kill it (friction / compound-candidate)
When the OpenRouter account hit 0 credits mid-run, the first builder reflexively added an
`openrouter-credit-guard.ts` that SKIPPED builtin+opencode tests when the account was
overdrawn — the exact `skipIf`-to-green anti-pattern Track AR exists to eliminate — and even
applied it to out-of-scope already-shipped files (AM2/AN2/AR2). It passed that builder's own
bar. The orchestrator caught it; a second builder reverted it (commits bdab94c2 / bc600888 /
7f266513).
**Why:** Environmental pressure (a broke account) reliably triggers the skip-to-green reflex
even when the WP's whole purpose is the opposite. Compound candidate: builders need an explicit
"credit/quota exhaustion = BLOCKED, never skip" rule, and the honest-harness-guard does not
catch a *runtime* credit-balance skip (it only catches static `skipIf` / `skip()`).

### 2026-06-30 — Builders strand on backgrounded long verify, twice (friction / compound-candidate)
Two builders ended their sessions waiting on a backgrounded `npm run verify` / Monitor loop
(agenticExecuted=0 stranded attestation), despite the foreground-verify instruction. The
orchestrator had to drive verify itself. This recurs across AR1/AR2/AR3/AR5 too.
**Why:** Strong compound signal that the pipeline should never ask a builder to run the full
long verify — the orchestrator should own it.

### 2026-06-30 — Concurrent sibling pipelines make the integration leg / per-harness floor unreliable (cost / friction)
Machine load ~11 with 3 sibling worktree verifies (AO2/AR4/AR5) running real-LLM lanes against
the SAME OpenRouter account → the integration vitest leg crashed producing no JSON → the
per-harness attestation floor correctly failed-closed to 0/0 (refused a false green). Targeted
isolated lane runs passed (#11 14/14, #13 8/8).
**Why:** The floor works, but full-verify-green is only obtainable in a low-load window. Running
N pipelines concurrently against one OpenRouter account + one machine is self-defeating for
harness lanes.

### 2026-06-30 — Model-config churn, 3 rounds (cost)
The founder revised per-harness lane models mid-run three times for cost
(gpt-4o-mini baseline → deepseek-v4-pro / kimi / opus → deepseek-v4-flash / sonnet /
gpt-5.4-mini / glm-5-turbo). Each round required a targeted re-prove of #11 / #13.
**Why:** The per-harness lane model set is a founder-tunable knob living in AR2's
`provision-real-session.ts`. Consider surfacing it as a single config the founder edits without
a builder round-trip.

### 2026-06-30 — Producer/evaluator separation + honest-harness floor did their job (win)
The producer/evaluator separation caught 2 CRITICALs in the Phase-2 architecture critique
(a planned duplicate AM2 proof — the exact anti-goal — and a misread allowlist state) before
any code. The final triage (2 convert / 8 demote / 3 service-keep / 1 split) held. The
honest-harness-guard + per-harness floor both did their job: guard clean, floor failed-closed
under load.
**Why:** Early evaluation caught the highest-cost mistakes (duplicate proof / anti-goal) at
zero implementation cost, and the runtime safety nets refused a false green rather than
manufacturing one.
