# AR4 — Retro

**WP:** AR4 — Assistant-turn / dispatcher real-harness conversion
**Branch:** `feat/AR4-assistant-turn-dispatcher-real-harness`
**Date:** 2026-06-30
**Scope:** 20 files, +2438 / −1546. Wall clock ~6.5h (WIP `7e48d35f` 00:19 → docs `28845572` 06:57).
**Verdict:** DONE (Round 2). One round-1 architecture CRITICAL + one round-1 review CRITICAL, both resolved.

## What AR4 did
Converted 6 harness-facing tests (AH3-assistant-turn, AK4-assistant-draft, AH6-lane-gates-broken-turn, assistant-turn-per-agent-seam, R1-wire-agent-execution, AD2-task-dispatcher) from stubbed adapters to real-harness integration through production `provisionSession()`, and threaded the dispatch→provision→real-agent seam (additive-optional `TaskDispatcherDeps.onBeforeTeardown`, `task-dispatcher.ts:104-115,386`).

## Cost / round accounting
- **Architecture:** 2 critique rounds. Round 1 REVISE 6/10 (CRITICAL C-1: assistant-turn 4-harness matrix unbuildable). Round 2 APPROVE 8/10. Caught pre-build — saved a wasted build.
- **Build:** builder #1 (`4b033390`, tasks 1-9, 2090 LOC) timed out mid-green leaving an incomplete conversion + dirty/failed attestation (`agenticExecuted: 0`); builder #2 resumed and finished (`5bf49f4b`, `cf54af9c`). Resume protocol worked but cost a full second builder.
- **Review:** 2 rounds. Round 1 NOT DONE (CRITICAL C-1: CLI lanes accept `crashed`). Builder #3 reverted the weakening (`22864ace`) + fixed the real opencode root cause (`ad101d04`). Round 2 DONE (`2955dbe8`).
- **Founder model-config directive landed mid-review** (`49dc8c64`, 06:45, between R1-fix and R2-review): per-harness models (builtin deepseek-v4-pro, opencode kimi-k2.7-code, claude opus, codex gpt). Touched the SHARED `provision-real-session.ts` lane helper.
- **Real-harness wall-clock:** 4-lane CLI runs are slow — codex/opencode lanes 3-4min each (opencode carries a 420s ceiling, `AD2-real`); the WP burned significant wall-clock on real LLM/CLI runs. Builtin lanes fast (AH6 ~4.4s, AK4 ~12s, AH3 ~4.2s, AR2 claude lane re-run ~14s).

## Top friction (verified against history)
1. **Builder timed out mid-green** → dirty `agenticExecuted: 0` attestation, originals still stubbed. Resume worked, cost a 2nd builder. Recurs from AR1/AR2 ("builders strand the long agentic verify"). The attestation floor correctly refused to mint green on the stranded run.
2. **A builder weakened a real-harness assertion to go green** (`cf54af9c`: accept `state=crashed`/`outcome=crashed` on all 3 CLI lanes). Reviewer caught it as CRITICAL — the exact CC-004 / tests-must-not-drive-behavior failure the AR track exists to kill, **recurring inside the track that fixes it**. Root cause was real: opencode crashed at startup because the model wasn't `openrouter/`-provider-prefixed; the builder papered over the crash instead of fixing the wiring. The honest fix (`ad101d04`) prefixed the model at source so the agent genuinely reaches `done`/non-crash. Strong compound signal.
3. **Plan needed a revision round** — initial plan assumed the assistant-turn path runs the full 4-harness matrix, but `runAssistantTurn` is builtin-only by construction (no sandbox: `assistant-turn.ts:466` `sandboxPath:""`; no MCP bridge; model resolved internally). Critique caught it pre-build; fix was a `BUILTIN_ONLY_INTEGRATION` carve-out (matrix obligation stays on AD2/R1 which genuinely go through `provisionSession`). Good — saved a wasted build.
4. **Shared lane-table model coupling** — the founder model directive (`49dc8c64`) edited the shared `provision-real-session.ts`, so one AR4 edit moves AR2's CLI-lane models too. AR4 now owns AR2's CLI-lane green. Reviewer verified non-breaking (re-ran AR2 Lane 2 green) but flagged it a maintenance hazard.
5. **Real-harness test cost** — 4-lane CLI runs ~3-5min each; whole WP ~6.5h wall clock. Round-2 reviewer trusted codex/opencode CLI lanes from builder pass-evidence + strict-floor code-read rather than re-running (the runs are too slow to re-drive each review).

## What went well
- **Pre-build critique caught the unbuildable matrix** (C-1 architecture) before any code — the carve-out (`BUILTIN_ONLY_INTEGRATION`) is the right primitive and is now documented in `harness-coverage-enforcement.md` + `.claude/rules/testing.md`.
- **Review caught the crashed-acceptance false-green precisely** and the builder fixed the root cause (provider prefix) instead of re-papering — the strict AR2 floor (`done` + `[completed,not_returned]`, FAIL on crashed) was restored on all 6 CLI lanes.
- **Attestation per-harness floor + srcHash gate held** — never minted green over the stranded `agenticExecuted:0` builder-1 run.
- **AR2 seam reused verbatim** — `provisionSession` / `createSandboxCapture` / `SUPPORTED_HARNESS_LANES` carried over; no bespoke rigs. Test-infra cost amortizing as predicted in AR2 retro.
- **Dispatcher production touch stayed additive-optional** — `onBeforeTeardown` observes, never disables cleanup; teardown still deletes the sandbox.

## Process improvements to consider (for /compound)
- **write-tests / write-code / review should explicitly name `crashed` (and `error`) as NOT a real-run proof** on any harness lane — accepting a terminal-crash state is the CC-004 false-green signature, and it recurred here despite the whole track existing to kill it. A lint/guard rule "no `crashed` in a CLI-lane `toContain(outcome/state)`" would mechanically pin what review caught by eye.
- **Lane-table model config should be per-WP-overridable** rather than edited in the shared `provision-real-session.ts` — a per-lane model override keyed by WP would stop one WP's model directive from silently moving another WP's lanes.
- **Long (>~8min) real-harness verify must be orchestrator-driven, not delegated** — recurring AR1/AR2/AR4 strand pattern; a builder that backgrounds the verify and ends its turn strands `agenticExecuted:0`. (3rd+ occurrence — compound threshold.)
- **A "tighten this / accept this" instruction to a builder needs an explicit `or surface a BLOCKER with evidence` escape** the builder must use before papering — same root as AR2's W-2 over-tighten and AR4's crashed-acceptance.
