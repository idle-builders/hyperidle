# Block 1a — Plumbing (per-turn cost)

**Cohort:** Round 1, parallel against `main`.
**Includes (formerly Block 5 + parts of Block 1):** TE-1, TE-2, TE-3, TE-4, TE-5, TE-23, TE-24-mention.

---

## Load-bearing claim

*The iteration count and per-turn output of every persona phase carries accidental waste — sequential reads where parallel was possible, ReAct turn-pairs where interleaved thinking would do, four verify cycles where one would do, stdout walls where structured summaries would do, JSON progress files where TOON would do. Cut the accident; the savings stack.*

This block tests **per-turn** cost reduction on the *existing* pipeline shape. It does not change session count or pipeline graph — those live in 1b. Splitting them here is what gives 1a clean attribution.

## Value lever

**Cache writes** (each turn re-caches the preamble — fewer turns = fewer cache writes) and **output tokens** (compressed reporters, TOON progress, structured summaries instead of stdout walls). Mostly independent of every other block. Multiple low-risk wins stacked into one branch.

## Risk profile

- **System complexity:** Low. Prompt edits across persona files, one verify orchestrator script (`scripts/verify.ts`), one custom Vitest reporter, one feature flag. Reversible per file. Whole block can be one PR.
- **Info-loss risk:** Low. TE-4's failure-bypass keeps raw stderr on red so compression is silent on green and transparent on red. The one real risk is TE-23's parallel reads with hidden dependencies (read-A-and-diff-of-A in the same batch); that's prompt-level.
- **Compounds with:** Block 1b (TE-21 continuous commit assumes verify is one orchestrated call); Round 3 (multiplicative — fewer turns × cheaper model). Mostly independent.

## Dependencies

- **Upstream:** Block 0 (`hyperidle.tool_calls.parallel`, `hyperidle.iteration` attributes for validation). Otherwise none.
- **Downstream:** Block 1b's TE-21 needs `scripts/verify.ts` to exist — so 1a must merge before 1b runs.

## Shippability

Small. One PR. Reversible per file. Measurable via `hyperidle.tool_calls.parallel` count and per-persona phase duration.

---

## TEs

### TE-1 — Token-aware default reporters

Edit root `package.json`:

- `"test": "vitest run --reporter=dot"` — humans get verbose via `test:verbose`.
- `"lint:biome": "biome check . --reporter=summary"` — humans get verbose via `lint:verbose`.
- `"lint:eslint": "bunx --bun eslint . --quiet"`.

**Risk:** dot reporter on failure shows little. **Mitigation:** TE-4 failure-bypass restores raw output on failure (success stays dot).

### TE-2 — Vitest TOON failure reporter

Custom reporter `packages/shared/src/reporters/vitest-toon.ts`. Wired into the *root* `vitest.config.ts` (one line). On failure emits TOON: `{file, test, assertion, line, code3LinesAround}`. On pass: a count.

**Skill change:** the verify orchestrator (TE-3) reads `test-output.toon` instead of stdout walls.

### TE-3 — `bun run verify` orchestrator (global)

Single global script that runs `check + lint:biome + lint:eslint + test + playwright` in order, captures each tool's structured output, finishes all of them (even if one fails), reports all failures together, prints one TOON summary. Lives in root `package.json` as `"verify": "bun run scripts/verify.ts"` with `scripts/verify.ts` being the only top-level script file the repo grows. Writes a short summary of how many items were verified per type (with success counts), then forwards only the actual error content. If outputs exceed a threshold, returns the top X.

**Skill change in 1b (not here):** `/verify` SKILL.md is removed; Builder + applier + ship stages reference `bun run verify` directly.

### TE-4 — Failure-bypass rule (preserve raw on red)

Universal rule in TE-3's orchestrator and TE-2's reporter: **success path is compressed to TOON; failure path appends raw stderr tail (last 200 lines)** of the failing tool. Snapshot test asserts a known Playwright failure still surfaces locator + selector data. Compression is silent on green, transparent on red.

**Why it ships with TE-1/2/3:** preserves debug context on red; without it the compression wins are unsafe to keep.

### TE-5 — TOON for `.pipeline/progress/<id>`

Switch the orchestrator (`packages/pipeline/src/progress.ts`) to write `.toon` using existing `toon-codec.ts`. Read both `.json` (legacy) and `.toon` for one release.

### TE-23 — Parallel tool calling instructed in persona prompts

Salesforce W&D paper: parallel tool calls give **1.4×–3.7× speedup** on independent operations. Most personas read 3–5 files at the start of their phase; sequential reads are the default unless explicitly instructed otherwise.

Add to every persona prompt: "**When reading multiple files or running multiple independent commands, batch them into a single response. Sequential reads are a bug, not a style.**"

### TE-24 — Interleaved thinking (mention-only on Opus 4.7)

For Opus 4.7 the feature is **auto-on** — no flag needed. Document this in the persona prompt template so:
- It is explicit when the value of the change is questioned later.
- Non-Anthropic harnesses or older Anthropic snapshots get the equivalent feature wired (beta header `interleaved-thinking-2025-05-14` for older Anthropic; OpenRouter "function calling with reasoning blocks" for non-Anthropic).

The persona prompt should not *assume* interleaved is on; behavior degrades gracefully when it's off.

---

## How they reinforce each other

| Pair | Effect |
|---|---|
| TE-1 + TE-2 + TE-3 + TE-4 | Reporters → custom failure reporter → orchestrator → bypass rule. One ingestion path with raw fallback on failure. |
| TE-3 + TE-23 | Verify orchestrator runs sub-tools concurrently; matches the parallel-tool prompt rule applied to persona behavior. |
| TE-23 + TE-24 | Batched parallel tool calls + interleaved thinking together = far fewer ReAct round-trips. |

## How they could make each other worse

| Pair | Risk | Mitigation |
|---|---|---|
| TE-1 + TE-4 | Dot reporter could swallow failure detail | TE-4 failure-bypass appends raw tail; snapshot test guards |
| TE-3 + raw debugging | Compressed verify hides rare failure modes | `bun run verify -- --raw` escape hatch; retros track regressions |
| TE-23 + over-batching | Agent batches operations with hidden dependencies (read file + diff that depends on the file) | Prompt limits batching to *independent* operations; explicit examples |
| TE-24 + non-Anthropic | Interleaved thinking unavailable on older models | Feature degrades gracefully to standard ReAct; persona prompts don't assume it's on |

---

## Open questions / adversary attacks

- **TE-1+TE-4:** "Dot reporter swallows transient flake details on success; you discover real bugs only when they're already failing." → TE-4 raw fallback on red. Settled by snapshot test that a known Playwright failure surfaces locator + selector data.
- **TE-3:** "Orchestrator hides which sub-tool failed; agent reads 'verify failed' and re-runs the whole pipeline instead of just the failing test." → TOON summary names the failing tool unambiguously; `bun run verify -- --raw` escape hatch honored.
- **TE-23:** "Agent batches operations with hidden dependencies. Result: stale data in batch, wrong decision." → Prompt examples + a retro signal on `hyperidle.tool_calls.parallel` ratio against rework rate.
- **TE-24:** "Effect size is the most speculative in the doc." → Ship the mention; do not credit it in any forecast until the A/B measures it. There's no downside.

## A/B mechanics

- **Branch:** `block-1a-plumbing` off the locked baseline SHA.
- **Compared against:** `main` at the same SHA.
- **Stories:** 3 of mixed complexity (S / M / L).
- **Primary signals:** total tokens, wall-clock per persona phase, `hyperidle.tool_calls.parallel`.
- **Ship rule:** ≥10% improvement on cost or wall-clock with no AC regression on all 3 stories.
- **Merge first** among the round-1 cohort, since 1b depends on `scripts/verify.ts` existing.

---

## Files touched

- `/Users/tobiasgrundmann/Development/hyperidle/package.json` — `test`, `lint:biome`, `lint:eslint`, `verify`, `test:verbose`, `lint:verbose` scripts.
- `/Users/tobiasgrundmann/Development/hyperidle/scripts/verify.ts` — new orchestrator.
- `/Users/tobiasgrundmann/Development/hyperidle/vitest.config.ts` — wire TOON reporter.
- `/Users/tobiasgrundmann/Development/hyperidle/packages/shared/src/reporters/vitest-toon.ts` — new reporter.
- `/Users/tobiasgrundmann/Development/hyperidle/packages/pipeline/src/progress.ts` — TOON write path.
- `.claude/agents/<persona>/AGENT.md` (all personas) — TE-23 parallel-tool prompt rule, TE-24 interleaved-thinking note.
