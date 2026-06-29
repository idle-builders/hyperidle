# Concept — Honest Harness Integration Testing (Track AR)

## What IS an honest harness integration test

An integration test exercises a **real integration point**, with no stub standing in for that point. There are exactly two archetypes, decided by one question — *is the harness / agent / CLI the thing under test?*

- **No → service integration.** The integration point is the DB + app. Real PGlite + real Hono via `{ db, app, eventBus }` fixtures. Deterministic. Already the norm.
- **Yes → harness integration.** The integration point is the **real installed harness**. Real binary, real model, **zero stubs**. A path through the harness adapter that is stubbed, scripted, echoed, or `vi.mock`'d is **not** an integration test — it is a mislabeled unit test. Test the pure logic as a `*.test.ts` unit, or test it against the real harness. No third option.

A harness absent means the work is **not done**: hard-fail with a message naming the missing harness, never `skipIf` to green. A green minted while every agentic test silently skipped is the deepest false-green — the precise failure this track closes.

## The harness model — STRICT (the load-bearing definition)

This is the noun the whole track stands on. Get it wrong and every gate is a phantom.

**HyperIdle has four harnesses. Three are CLIs; one is builtin.**

| Harness | Kind | Auth | Test gate |
|---|---|---|---|
| `claude` (Claude Code) | CLI binary | **keychain / inherited login — NO API key** | `requireHarness("claude")` (binary on PATH) |
| `codex` | CLI binary | **keychain / inherited login — NO API key** | `requireHarness("codex")` |
| `opencode` | CLI binary | **keychain / inherited login — NO API key** | `requireHarness("opencode")` |
| `gh` (GitHub CLI) | CLI binary | inherited login — NO API key | `requireHarness("gh")` |
| builtin | in-process | **OpenRouter API key (`OPENROUTER_API_KEY`) from `.env`** | the one builtin/OpenRouter key |

- **The CLIs are the leading, essential harnesses.** They are their own binaries; they authenticate through the host keychain / inherited login; they take **no API key**. (Keychain auth requires `USER`+`LOGNAME` in the adapter env allowlist — PR #374, claude-code is the real CLI, not an SDK.)
- **The builtin harness is secondary** ("good to have"). It is the **only** harness that uses an API key, and that key is **OpenRouter**, from `.env`. **Never OpenAI. Never Anthropic.**

### Hard prohibitions (non-negotiable)

- **`ANTHROPIC_API_KEY` does not exist in any scenario.** No test, gate, `requireHarness` token, helper, comment, or doc may reference it or treat it as a "proxy for claude is configured." The honest gate for the claude CLI is the `claude` binary.
- **No `openai-key` gate for the builtin path** — its key is OpenRouter.
- **`requireHarness`'s vocabulary is harness-named, not key-named:** `claude`, `codex`, `opencode`, `gh`, and the single builtin/OpenRouter `.env` key. A test that needs "a configured agent" names the harness it actually drives.
- **No "CLI/SDK" phrasing.** There is no SDK path; it is **real CLI binary** everywhere. Any "SDK" mention is a bug to fix in lockstep.

### Why this is the crux

A test gating on a key the real path never uses is a phantom gate: it either skips silently (false green — the thing this track kills) or hard-fails for the wrong reason (e.g. demanding `ANTHROPIC_API_KEY` for a claude-CLI test that authenticates via keychain). The `session-provisioning` integration test inheriting an `anthropic-key` proxy is exactly this failure: it drives `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` (keychain) but was gated on an Anthropic key that should never exist. The honest gate is `requireHarness("claude")`.

## What AR1 delivers (the mechanism that keeps the model true)

The two-archetype rule prose has landed; AR1 ships the enforcement so the prose cannot drift:
1. **Lane collapse** — retire `.real-harness.test.ts` + `vitest.real-harness.config.ts`; fold into `*.integration.test.ts` (real-model files serial). No separate lane survives in any naming table.
2. **`requireHarness(name)`** — hard-fail (never skip) on an absent harness, conforming strictly to the model above.
3. **Stub-adapter guard** — fails the build when a harness-facing `*.integration.test.ts` constructs a fake/scripted/echo adapter, `vi.mock`s the harness/LLM client, or `skipIf`s on harness availability. No false positives on legit units or non-harness service integration tests.
4. **Attestation executed-count floor** — the attested local result records executed-vs-skipped for agentic integration tests; a green cannot be minted while every agentic test skipped.
5. **Lockstep prose** — `.claude/rules/testing.md`, both `CLAUDE.md` tables, and the `write-tests`/`review` skill guidance always describe the shipped structure and the strict harness model.

Out of scope for AR1: converting the ~30 stubbed harness tests (AR2–AR6), and the product bugs honest tests surface (fixed in the WP that surfaces them).
