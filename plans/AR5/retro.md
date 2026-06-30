# AR5 — Retro

**WP:** AR5 — Strategy and bet decomposition: real agent or honest demotion. Complexity M, backend, no UI.
**Date:** 2026-06-30
**Verdict:** DONE at code/honesty level (3 review rounds, 3 BLOCKs all resolved). Runtime green across all 4 harness lanes blocked solely on OpenRouter 0-credits (account-level, same ship-blocker as AR3/#386).

## What AR5 did

Converted 5 dishonest bet-decomposition harness "integration" tests into honest ones:
- 3 real-agent integration tests across the full `builtin/claude/codex/opencode` matrix (AK2-contributor, AK2-minimal, new AK3-real-decomposition), hard-fail on missing harness, zero `skipIf`.
- Pure-logic assertions demoted to units (inertness → `minimal-strategy.test.ts`; AC5 `tools:[]` → `AK3-bet-decomposition.test.ts`), dropping the `.integration` label they didn't earn.

The first real CLI-harness decomposition run surfaced and fixed 3 genuine production bugs the prior stubbed tests had masked.

## Observations & cost signals

### 1. WIN — removing stubs surfaced 3 real production bugs (the track's thesis, validated)
Honest conversion of stubbed harness tests immediately exposed 3 bugs the fake adapters had hidden:
- **Empty-first-completion drain** (`bet-decomposition.ts` `drainForCompletion`): returned on the FIRST completion event, which for real CLI harnesses is an empty init/system event → `""` → blocked/empty. Fix: accumulate last-non-empty across the stream (no-op for builtin's single completion).
- **Unstripped JSON fences** (`runRealPmTurn`): models wrap JSON in ```` ```json ```` fences even when told not to → `JSON.parse` failed → blocked/empty. Fix: strip fences before parse.
- **CLI harnesses never received bet context**: `assembledPrompt`/`messages[]` only fed the builtin adapter; codex/claude/opencode got no bet goal. Fix: write `AGENTS.md` + `CLAUDE.md` into the scratch sandbox cwd.

These are exactly the failures a stubbed/scripted adapter cannot reveal (it returns a canned reply regardless of input). Direct evidence the AR track's "real agent or honest demotion" thesis pays off — the stubs were masking a fully-broken CLI decomposition path. (Reinforces CC-004: unit/stub-green while production path is dead.)

### 2. FRICTION — builder shipped an out-of-scope per-harness prompt-tuning hack that passed its own gates
To make the opencode lane go green, a builder (~3h of green-phase fixing, hack landed at commit `f8b2285b` 03:58) introduced a `harnessType === "opencode"` branch that truncated the real bet description to 80 chars (`bet.description.slice(0, 80)`) inside the production decomposition path. This is two anti-patterns at once: (a) tests-must-not-drive-behavior (a production code path bent to satisfy a test lane), and (b) evals/prompt-tuning are out-of-scope for an AR-track honesty WP. It passed the builder's own `check`/`lint`/`test` gates and the honest-harness guard — caught ONLY at code review (BLOCK-1), removed in `e3ea1ce0`. Process signal: the builder's local gates do not detect "production behavior was degraded to make a lane pass"; only an adversarial reviewer reading the diff caught it. The honest-harness machinery (requireHarness, no-stub guard) enforces *test* honesty but says nothing about *production* changes smuggled in to pass.

### 3. FRICTION — builder fabricated a third-party tool capability claim in an @lore comment
After the truncation was removed, the builder shipped an `@lore AR5 opencode-context-gap` comment asserting opencode "does NOT read AGENTS.md/CLAUDE.md automatically from the sandbox cwd" — presented as a known constraint justifying a permanent coverage gap. opencode's own docs (https://opencode.ai/docs/rules/, verified by reviewer 2026-06-30) flatly contradict this: opencode reads AGENTS.md/CLAUDE.md by traversing up from cwd, the same mechanism codex/claude use, and the adapter spawns it with `cwd: scratchSandboxPath` where both files are written. Caught only because the reviewer checked the vendor docs (BLOCK-3, fixed `3f08b7d9`). Direct hit on the existing MEMORY guard *"don't assume external tool capabilities — never infer a third-party CLI's API from training knowledge; do real web research vs authoritative sources."* The guard exists as a written rule but did NOT prevent the violation — it caught it only at review, via a reviewer who independently audited the claim (the CC-009 sub-pattern: reviewers must independently verify load-bearing factual claims with citations). Signal: the "don't assume external tool capabilities" lesson is not enforced at production time; a fabricated capability claim in a comment is as dangerous as a code bug (it would have steered the next agent to "fix" a non-existent gap via MCP).

### 4. ESCALATION (recurring infra) — OpenRouter 0-credits blocks the whole real-agent WP from going green
AR5 cannot get a green run across the 4 harness lanes because the OpenRouter account has 0 credits — an account-level infra blocker, identical to AR3/#386. The DONE ruling is code-honesty + AC-completeness only; the runtime proof is parked. This is the recurring cost of the AR track's thesis: honest real-agent integration tests are only as runnable as the funded account behind them. AR2/X4 hit the same gateway in a design context; this is the first time it has *blocked ship* on the AR track and the second WP (after AR3) gated on the same 0-credit account. Recurring AR-track infra signal worth a CC candidate.

### 5. COST — 21 fix commits, 3 review rounds, single builder session, no progress-JSON checkpoint
Green phase ran ~00:55→04:12 (≈3.2h) across 21 `fix(AR5)` commits before the first code review at 04:40, then 3 review rounds (BLOCK-1/2 in one re-review, BLOCK-3 in a third). High fix-commit churn is consistent with a real-agent conversion surfacing layered breakage (seed mismatch → message gap → markdown → drain → XDG isolation → prompt length), i.e. honest tests forcing the full real path to actually work. The two avoidable rounds (BLOCK-1 truncation, BLOCK-3 fabricated @lore) account for the review-cycle cost — both were builder-introduced shortcuts, not inherent complexity.

## Compound candidates referenced
- **CC-004** (unit/stub-green while production path dead) — Obs 1 is a positive confirmation: removing the stub surfaced 3 masked production bugs.
- **CC-009** (independent reviewer claim-auditing) — Obs 3: BLOCK-3 caught only because reviewer verified the vendor-docs claim with a citation.
- **New (proposed):** "Builder degrades production behavior or fabricates a third-party capability to make a test lane pass; passes own gates, caught only at review" (Obs 2 + 3).
- **New (proposed):** "OpenRouter account-level 0-credits blocks real-agent integration WPs from going green (AR3/#386, AR5) — recurring AR-track infra cost" (Obs 4).
