# Retro — AR1: Honest Harness Integration Testing

**Work package:** AR1 (L, infra/tooling, track AR) — PR #381, branch `feat/AR1-honest-harness-testing`.
**Verify proof:** `status=passed dirty=false agenticExecuted=103 agenticSkipped=0` (HEAD `093d9191`, env=`OPENROUTER_API_KEY` only).
**Outcome:** shipped. Strict harness model locked and enforced; one real false-green killed; two latent production bugs surfaced and deferred to AR2.

This is a fresh-context, observe-don't-fix retro. Each observation below is verified against the git log (`origin/main..HEAD`) and the plan/critique/review artifacts retired in commit `9de013ab` (recoverable from git history).

## What AR1 shipped

The enforcement mechanism for honest harness integration testing under a STRICT harness model:
- `requireHarness(<name>)` hard-fail helper — CLIs (claude/codex/opencode/gh) = keychain binary on PATH (no API key); builtin = `OPENROUTER_API_KEY` only; `ANTHROPIC_API_KEY` never exists.
- `.real-harness.test.ts` lane collapsed into `*.integration.test.ts` (4 files renamed, dead config + script deleted, two vitest projects: service + harness).
- `honest-harness-guard` lint check — allowlist-gated stub-content detection (lane/skipIf/stub-adapter patterns).
- Attestation executed-count floor — `agenticExecuted`/`agenticSkipped` recorded by `verify-attest`, enforced by `check-attestation`.
- Lockstep prose across `testing.md`, `CLAUDE.md`, `testing-patterns.md`, write-tests/review skills.

## Cost & friction observations

### 1. Reset + full restart from a wrong-baked harness/key model (high cost)
This WP was fully built once, then founder-reverted (`c2e903e9`) because the implementation baked a WRONG harness/key model (`anthropic-key`, `openai-key` tokens for the builtin path). The revert removed the entire implementation + tests + plan artifacts: **37 files, 6708 deletions** in one commit. The restart (`3b038267` locked the STRICT model in concept + workpackage spec) rebuilt from a corrected, locked concept. **What would have caught it earlier:** the concept lock is exactly the fix — the wrong model slipped through because the harness/key vocabulary was never pinned as a load-bearing noun BEFORE code. The restart began only after `plans/AR/concept.md` locked "CLIs are keychain binaries / builtin uses OpenRouter / no anthropic key anywhere." A concept pass on the key/harness vocabulary up front would have prevented a full L-sized rebuild. The architecture itself scored 8.5 both times — the gap was conceptual (what IS a harness credential), not architectural.

### 2. The mechanism immediately surfaced a real false-green (track working as designed)
`session-provisioning.integration.test.ts` was gated `skipIf(!ANTHROPIC_API_KEY)` — a key that never existed in the strict model, so the test **always silently skipped**. AR1 converting it `skipIf -> requireHarness("claude")` made it run honestly for the first time, and it immediately RED'd on a real pre-existing test-setup defect: the test's `provisionSession` deps omitted `mcpBridgeRegistry`/`mcpBaseUrl`, so no `.mcp.json` was written, while `CLAUDE_CLI_CONFIG.args` unconditionally pass `--mcp-config .mcp.json --strict-mcp-config` -> the real claude spawn crashed "MCP config file not found." Fix (`1d1bbaa9`) was test-setup-only (stood up the real Hono MCP route, mirroring AL7/server-factory), zero production change, assertions strengthened. **The gap between "a test exists" and "a test runs honestly" was invisible for the entire life of that test** — a phantom skip gate keyed on a never-present env var reads green forever. This is the precise failure AR1 exists to kill, caught on its own first honest run.

### 3. Env-pollution false-failure: sourcing the whole root `.env` for the verify env (footgun)
The green-verify proof initially showed 9 failures. 8 were a single env-pollution artifact: the verify environment was created by sourcing the WHOLE root `.env`, which exports `HYPERIDLE_API_KEY` — flipping the Hono app into auth-enforcing mode, so service-integration tests got 401. Isolating the verify env to `OPENROUTER_API_KEY` only fixed all 8. **The verify env must be minimally scoped to exactly the keys the harness needs; sourcing a full `.env` silently changes app behavior (auth mode) and produces failures that look like real test breaks.**

### 4. Real-LLM nondeterminism folded into the attested lane -> needed lane-level retry
The 9th failure (the AL7 two-session opencode loop) was confirmed real-LLM nondeterminism — it passed on isolated re-run (7/7). Resolved with `retry:2` (3 attempts) scoped to the HARNESS vitest project ONLY (`093d9191`); the SERVICE project is deliberately NOT retried (deterministic DB+app tests must surface real races). **Folding real-binary agentic-loop tests into the auto-run attested lane introduces model nondeterminism the lane must tolerate** — without lane-scoped retry the attested gate is a coin-flip; with it scoped to only the real-LLM lane, a genuine logic/contract break still fails all 3 attempts.

### 5. Subagent strands on the long (~8min) real-harness verify
Builder agents repeatedly backgrounded the ~8-minute full real-harness verify and then ended their turn, producing interrupted attestations (`status=failed`, `agenticExecuted=0`). The orchestrator had to drive the long verify itself in the background to get a clean attestation. **A long (>~8min) real-harness verify should be orchestrator-driven, not delegated to a subagent that strands on the background wait.** The attestation floor correctly refused to mint green on the stranded `agenticExecuted=0` runs (mechanism working), but the strand pattern cost repeated wasted verify cycles.

### 6. Latent production bugs surfaced by honest tests, deferred to AR2 (forward signals)
Two real production bugs were surfaced by the now-honest test and correctly scoped OUT of AR1 (test-honesty only), lored at their sites, assigned to AR2:
- `CLAUDE_CLI_CONFIG.args` passes `--mcp-config .mcp.json --strict-mcp-config` **unconditionally** -> claude crashes on any session provisioned with NO MCP bridge. Production masks it because server-factory always supplies a bridge. (`59c67419`)
- `isReturnAction` does not strip the `mcp__<server>__` namespace prefix -> a real CLI+MCP session is verdicted `not_returned` even when the agent returned. The test asserts the honest `not_returned` + a real agent message row, so an AR2 fix flipping it to `completed` is caught here.
- Also noted: product builtin-credential resolution still checks `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` — the strict model is **test-gate-only** so far; the production credential path is not yet strict.

## Successes worth protecting

- **The attestation floor refused every false-green path:** it rejected the stranded `agenticExecuted=0` runs AND the stale pre-AR1 attestation (`srcHash` mismatch). It never minted a green over a RED or empty integration leg. Keep the floor + `srcHash` gate.
- **The guard's AC5 gap was caught in review and closed precisely:** the initial guard missed the dominant in-repo stub idiom (factory function returning `: HarnessAdapter`). Review found 2 unflagged offenders (`AL6-return-gate`, `ah5-gates-on-broken-stream`); fix (`c336cf27`) added a return-type-anchored pattern `/\)\s*:\s*HarnessAdapter\b/` with negative tests proving no false positive on parameter annotations / type imports, then allowlisted the 2 as known AR6-conversion debt.
- **Strict scope discipline:** every surfaced production bug was lored and deferred, not fixed in-band. AR1 changed zero production behavior to make tests pass. The reverted forbidden-token vocabulary did NOT recur (round-2 sweep clean).
- **Lockstep prose held:** no `.real-harness` survivors in `docs/`, `.claude/`, `CLAUDE.md`; the guard's lane-check enforces it mechanically going forward.

## Forward signals for AR2 / track AR

1. AR2 (provisionSession-seam WP) owns: (a) conditional `--mcp-config` args or always-write `.mcp.json`; (b) `isReturnAction` MCP-namespace stripping. Both have regression-catching assertions already in `session-provisioning.integration.test.ts`.
2. The strict harness model is enforced at the TEST GATE only. Making the production credential-resolution path strict (drop `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` from builtin resolution) is unclaimed forward work.
3. Two AR6-debt files are allowlisted in the guard (`AL6-return-gate`, `ah5-gates-on-broken-stream`) — AR6 owns converting them off the stub-the-seam idiom; until then they ride the allowlist.
