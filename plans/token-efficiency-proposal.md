# Token Efficiency Proposal — HyperIdle Pipeline

**Date:** 2026-04-30
**Goal:** Reduce token consumption of the autonomous pipeline (bin/pipeline + `/pipeline` skill + 28 sub-skills) by 50–70% without compromising autonomy or validation rigor.

---

## TL;DR

The pipeline runs ~17 sequential skill steps per story. Each step spawns a sub-agent that re-reads context, runs `bun run check`, `bun run lint`, `bun run test`, `git diff`, etc. Today nearly all of that output flows into context raw. Five orthogonal interventions stack to a 50–70% reduction:

1. **CLI output compression** (RTK-style proxy on git/test/lint/build) — biggest single win, ~80% on those commands.
2. **Token-friendly reporters by default** (Vitest `dot`/`minimal`, Biome `--reporter=summary`, ESLint `--quiet`).
3. **Structured data in TOON, not JSON** for everything the pipeline reads/writes (progress files, plan→tests handoff, retro feeds). The `toon-codec.ts` in `packages/shared/src/` is the foundation — adopt it everywhere.
4. **Prompt caching** by reorganizing skill files to put stable prefixes first (CLAUDE.md, ARCHITECTURE.md, the canonical-shapes contracts under docs/) and dynamic args last.
5. **Skill prose diet** (Caveman-style) — skills are ~150–600 lines each and read on every step. A 30% trim across 30 skills is meaningful.

Keep all automation rules (autonomy, no human, validation-first). The pipeline orchestration logic in `bin/pipeline` and `.claude/skills/pipeline/SKILL.md` stays — only the *bandwidth between steps* shrinks.

---

## Where the tokens go today

A rough audit of the 17-step pipeline for a single story:

| Source | Per-step cost | Steps using it | Total |
|---|---|---|---|
| Re-reading `CLAUDE.md` + `docs/ARCHITECTURE.md` + the canonical-shapes contracts under `docs/<topic>/` + track file | ~8K tokens | 17 | ~136K |
| `git diff` / `git status` outputs | ~2–10K | 6 (review skills) | ~30K |
| `bun run test` raw verbose output | ~5–20K | every `/verify` retry | ~60K+ |
| `bun run lint` (Biome + ESLint full) | ~1–5K | every `/verify` retry | ~20K |
| Plan / critique / review markdown handoffs (JSON-ish) | ~3K | 17 | ~51K |
| Sub-agent context pre-loads (~20K each per Anthropic docs) | ~20K | spawned per skill step | ~340K |

Headline: **~600K+ tokens per story, before any actual reasoning**. The pipeline skill itself (`SKILL.md`) is only 106 lines — the cost is in what it *causes* downstream agents to read.

---

## Research summary — what others have learned

### TOON (Token-Oriented Object Notation)
30–60% fewer tokens than JSON for structured data, with *higher* model accuracy on retrieval tasks (74% vs JSON's 70%). The repo already has `packages/shared/src/toon-codec.ts` — but pipeline progress files (`.pipeline/progress/<id>.json`), plan handoffs, and retro feeds are all still JSON/markdown-tables. ([TOON spec](https://github.com/toon-format/toon), [InfoQ](https://www.infoq.com/news/2025/11/toon-reduce-llm-cost-tokens/))

### RTK (Rust Token Killer)
A CLI proxy. `rtk git diff`, `rtk bun run test`, `rtk eslint .` — applies four compressions: smart filtering (drops boilerplate), grouping (bundles by directory or rule), truncation (keeps relevant), deduplication (200 identical errors → 1 line + count). Real-world data: 89.2% reduction across 2,927 commands; `find` 78%, `git status` 81%, test runs 91%. ([rtk repo](https://github.com/rtk-ai/rtk), [MadPlay benchmark](https://madplay.github.io/en/post/rtk-reduce-ai-coding-agent-token-usage))

**Caveat:** RTK aggressively strips Playwright failure debug info (DOM snapshots, locator details). The repo's `/verify` runs Playwright. We need a Playwright bypass or the CLI-disk-and-summarize pattern below. ([rtk issue #690](https://github.com/rtk-ai/rtk/issues/690))

### Caveman compression
Strip articles/grammar from prompts, use arrows and symbols. Claimed 60–75% savings; benchmarks show real-world 14–21%. Useful for *skill prose* — the SKILL.md files agents re-read every invocation. Don't apply to user-facing copy or specs. ([Caveman repo](https://github.com/wilpel/caveman-compression), [Hacker News discussion](https://news.ycombinator.com/item?id=47647455))

### Prompt caching (Anthropic)
Cache reads cost 10% of normal input. 5-min default TTL, extendable to 1 hour. Requires identical prefix. The pipeline currently reorders or interpolates `$ARGUMENTS` early in skill prompts, defeating caching. Move the dynamic part to the very end of every skill file. ([Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching))

### Subagents — nuanced
Each subagent has its own context window, so exploratory file-reading stays out of the parent. But: a fresh subagent loads ~20K of system context before useful work, and multi-agent flows cost 4–7x. **Rule of thumb:** spawn a subagent when the side task would otherwise consume >40K of parent context; otherwise inline. Today the pipeline spawns one per step (17 spawns × 20K = 340K of cold-start tax). Compressing to ~5–6 longer-lived agents that handle multiple adjacent steps is a real win. ([Anthropic subagent docs](https://platform.claude.com/docs/en/agent-sdk/subagents))

### ast-grep over ripgrep where structure matters
ripgrep is ideal for literal lookups. ast-grep matches on the parsed CST, so a search for "find all `useEffect` calls with no dep array" returns clean results instead of a wall of regex false positives. Less noise → fewer tokens spent re-reading files. ([ast-grep](https://ast-grep.github.io/))

### Playwright CLI > Playwright MCP
4x reduction (114K → 27K tokens) by writing artifacts to disk and letting the agent read what's needed. The repo already uses CLI Playwright — keep it that way; do not migrate to the MCP. ([TestCollab benchmark](https://testcollab.com/blog/playwright-cli))

### Test-runner reporters
Vitest auto-detects AI agents and switches to minimal — but only on recent versions. Bun test has `--reporter=dots`. Biome supports `--reporter=summary`. ESLint has `--quiet`. ([Vitest reporters](https://vitest.dev/guide/reporters))

---

## Concrete adoption plan

Each item has an owner skill / file, an estimated impact, and a verification method.

### 1. CLI output compression (highest leverage)

**Scope:** Wrap `git`, `bun run test`, `bun run lint`, `bun run check`, `bun install` in a thin compressor that lives in this repo (avoid an external Rust binary dep).

**Approach:** Add `bin/rtk` — a Bun TypeScript script that runs the inner command, captures stdout/stderr, applies four passes:
- **Filter:** drop banner lines, version headers, package install progress bars.
- **Dedup:** collapse N identical lines into `<line> (×N)`.
- **Group:** group lint errors by rule, group test failures by file.
- **Truncate:** keep first 50 + last 50 lines of long stack traces with `[… N lines elided …]`.

**Bypass rule:** if any command exits non-zero AND the calling skill is `/verify` or `/write-code`, emit raw stderr after the compressed summary. This addresses the Playwright debug-loss problem.

**Wire-up:** Update `.claude/skills/verify/SKILL.md` to call `bin/rtk bun run test`, etc. Update `package.json` scripts: add `test:rtk`, `lint:rtk`, `check:rtk` aliases.

**Estimated saving:** 60–80% on every `/verify` invocation. With ~3 verify cycles per story, this is ~150K → ~30K tokens per story.

**Verify:** Snapshot raw vs compressed output for a known-failing test run; assert the agent can still locate the failing test and line. Test: a Vitest `expect()` line+col must survive compression.

### 2. Token-aware reporters by default

**Scope:** `package.json` scripts.

**Changes:**
```
"test":          "vitest run --reporter=dot",
"test:verbose":  "vitest run --reporter=verbose",
"lint:biome":    "biome check . --reporter=summary",
"lint:eslint":   "bunx --bun eslint . --quiet",
"lint:fix":      "biome check --write . --reporter=summary",
```

CI keeps verbose (humans look at it). Agents always hit the dot/summary path.

**Estimated saving:** 30–50% on green test runs (the common case during iteration). Failures still show enough detail because rtk preserves the failure block.

**Verify:** Run both reporters on a real failing test, confirm dot reporter still shows the failing assertion.

### 3. TOON everywhere structured data flows between agents

**Scope:** `.pipeline/progress/<id>.json`, plan→tests handoffs in `plans/<id>-plan.md`, retro feeds, design-critique scorecards.

**Changes:**
- Add `bin/pipeline-progress` reader/writer that uses `toon-codec.ts` and writes `.pipeline/progress/<id>.toon`.
- Update `packages/pipeline/src/progress.ts` to read both `.json` (legacy) and `.toon` (new), write `.toon` only.
- Update `.claude/skills/pipeline/SKILL.md` state-contract section to reference `.toon` files.
- For plan files (currently markdown with embedded JSON tables), keep markdown prose but encode the structured tables (route checklist, ordered tasks, schemas) as TOON code blocks.

**Estimated saving:** 30–50% on every step that re-reads progress / plan handoffs (~17 steps × ~3K = 50K → ~25K).

**Verify:** Round-trip test in `packages/shared/src/__tests__/toon-codec.test.ts` covering progress-file shapes. Pipeline runner picks up `.toon` and resumes correctly. (Build a `pipeline-resume.test.ts` that interrupts mid-story and confirms resume.)

### 4. Prompt caching — reorder skill prompts

**Scope:** All 30 SKILL.md files in `.claude/skills/`.

**Pattern today (cache-defeating):**
```
# Verify $ARGUMENTS  ← dynamic arg appears in the heading

Run in order. ...
```

**Pattern after (cache-friendly):**
```
# Verify

[stable instructions, references, rubric — 90% of the file]

---

## Target
$ARGUMENTS  ← dynamic arg only at the end
```

**Plus:** the pipeline skill itself loads `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/work-packages/the canonical-shapes contracts under docs/` — these should be referenced in the same order across every skill so the cache prefix overlaps.

**Estimated saving:** 90% on cache hits for stable prefixes. Skill prefixes are ≥1024 tokens (Anthropic's minimum for caching), so this works. Per story: ~136K of stable doc reads → ~14K (10% of cached input).

**Verify:** Inspect API responses for `cache_creation_input_tokens` vs `cache_read_input_tokens` over 3 consecutive pipeline runs; second run should show ≥80% cache hits on stable prefix.

### 5. Skill prose diet

**Scope:** All SKILL.md files. Many are 200–600 lines.

**Approach:** Move long expository sections (the "Why" paragraphs, the "Don't rationalize shortcuts" lists) into a single `.claude/rules/` reference file each skill *links* to. Keep skill body to: trigger conditions, ordered steps, exit criteria, argument hint. Aim for ≤120 lines per SKILL.md.

**What stays:** the decision-flowchart in `skill-discovery.md`, the validation-first rules in `CLAUDE.md`, the visual-parity rules. These are non-negotiable and must be re-read.

**Estimated saving:** 30% of skill-file tokens × 17 steps × ~3K = ~15K per story.

**Verify:** No regressions in skill triggering — run `/pipeline L1 L2 L3` against the trimmed skills and compare retro outputs to prior runs.

### 6. Pipeline architecture: collapse adjacent step spawns

**Scope:** `.claude/skills/pipeline/SKILL.md` step table.

Today: 17 steps × one fresh agent each. Many are tightly coupled and operate on the same files (steps 7+8 both scan; 10+11+12+13 all review; 14+14b both apply). Batching into ~5 longer-lived agents preserves separation of concerns without paying the 20K-cold-start tax 17 times.

**Proposed grouping:**
- **Group 1: Pre-flight** — concept check, design, design-critique
- **Group 2: Plan** — architecture + architecture-critique
- **Group 3: Build** — write-tests + write-code (TDD pair)
- **Group 4: Scan + Apply** — simplification-scan + slop-scan + apply-review
- **Group 5: Multi-perspective Review + Apply** — architecture-review + adversary-review + security-review + design-review + apply-review (steps 10–14b)
- **Group 6: DoD + Verify + Ship + Retro** — check-definition-of-done + verify + ship + retro

Each group is one subagent invocation; the agent runs the relevant skills sequentially in its own context. Failures still loop back to Group 3 per current contract.

**Estimated saving:** 17 × 20K cold-start → 6 × 20K = 220K saved per story.

**Verify:** Run a story through the new grouped pipeline; assert all `.pipeline/progress/<id>.toon` step transitions still occur, all artifacts land in expected paths, retro still fires.

### 7. Search hygiene

**Scope:** Skill instructions that say "search the codebase".

**Add:** `bin/search` wrapper that picks ast-grep for known structural patterns (function calls, hook usage, JSX matches) and ripgrep otherwise. Document in `.claude/rules/search.md`.

**Estimated saving:** Small per call (~500 tokens of false-positive noise eliminated) but applies often. ~5–10K per story.

**Verify:** Snapshot test on a known JSX query (find all `<Button>` with `onClick`) — ast-grep returns N matches, ripgrep returns N+M with M false positives.

---

## What stays the same (autonomy preserved)

The user explicitly called out preserving autonomy of `bin/pipeline` and `/pipeline`. None of the above changes affect:

- The autonomy contract in CLAUDE.md ("no human, never pause"). Compression is *transparent* to the agent — it sees less noise, not less truth.
- The validation-first principle. `/verify` still runs check + lint + test + Playwright. We change the *reporter*, not the *gate*.
- The `.pipeline/progress/<id>` state contract. Format moves to `.toon` but ownership rules don't change.
- The fail-fast on missing concept. Untouched.
- The retro loop. Untouched.

The orchestration logic in `packages/pipeline/src/runner.ts` and `bin/pipeline` need only minor changes (TOON read/write in `progress.ts`, optional rtk wrapping in spawned commands).

---

## Sequencing — recommended rollout order

A separate work package per intervention so each can be verified independently:

1. **TE-1** — Token-aware reporters (1-line `package.json` change, lowest risk)
2. **TE-2** — TOON for progress files (toon-codec already exists, schema change is contained)
3. **TE-3** — Skill prompt reorder for caching (mechanical, high leverage)
4. **TE-4** — `bin/rtk` CLI compressor (new code, needs careful Playwright bypass)
5. **TE-5** — Skill prose diet (split into `.claude/rules/` references)
6. **TE-6** — Pipeline group collapse (biggest behavioral change, ship last)
7. **TE-7** — `bin/search` ast-grep dispatch (smallest impact, ship anytime)

Each gets the standard validation: failing tests first, /architecture plan, /verify gate. Retro after each.

---

## Estimated total impact

| Intervention | Tokens saved per story (est.) |
|---|---|
| TE-1 reporters | ~30K |
| TE-2 TOON files | ~25K |
| TE-3 prompt caching | ~120K (cache reads) |
| TE-4 CLI compression | ~120K |
| TE-5 skill diet | ~15K |
| TE-6 pipeline grouping | ~220K |
| TE-7 ast-grep | ~7K |
| **Total** | **~537K per story** |

Current estimate ~600–800K per story → projected ~150–250K. **~65% reduction** without changing what the pipeline produces.

---

## Sources

- [TOON spec & benchmarks (toon-format/toon)](https://github.com/toon-format/toon)
- [InfoQ: TOON cuts LLM costs by reducing token consumption](https://www.infoq.com/news/2025/11/toon-reduce-llm-cost-tokens/)
- [rtk: CLI proxy that reduces LLM token consumption 60-90% (rtk-ai/rtk)](https://github.com/rtk-ai/rtk)
- [MadPlay: I only compressed CLI output, yet tokens dropped by 80%](https://madplay.github.io/en/post/rtk-reduce-ai-coding-agent-token-usage)
- [rtk issue #690: Playwright debug info loss](https://github.com/rtk-ai/rtk/issues/690)
- [Caveman compression repo (wilpel/caveman-compression)](https://github.com/wilpel/caveman-compression)
- [Hacker News: Caveman — why use many token when few token do trick](https://news.ycombinator.com/item?id=47647455)
- [DEV: I benchmarked the viral Caveman prompt — real savings 14–21%](https://dev.to/jakguzik/i-benchmarked-the-viral-caveman-prompt-to-save-llm-tokens-then-my-6-line-version-beat-it-2o81)
- [Anthropic prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Mager: How Claude prompt caching actually works](https://www.mager.co/blog/2026-04-29-claude-prompt-caching/)
- [Anthropic subagent SDK docs](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Buildtolaunch: Claude Code token optimization 2026 guide](https://buildtolaunch.substack.com/p/claude-code-token-optimization)
- [ast-grep: structural code search](https://ast-grep.github.io/)
- [Moderne: From grep to Trigrep — token-efficient code search for agents](https://www.moderne.ai/blog/from-grep-to-moderne-trigrep-code-search-for-agents)
- [Vitest reporters guide](https://vitest.dev/guide/reporters)
- [TestCollab: Playwright CLI — token-efficient alternative to Playwright MCP](https://testcollab.com/blog/playwright-cli)
- [Factory.ai: evaluating context compression for AI agents](https://factory.ai/news/evaluating-compression)
- [Precision dissection of git diffs for LLM consumption](https://medium.com/@yehezkieldio/precision-dissection-of-git-diffs-for-llm-consumption-7ce5d2ca5d47)
