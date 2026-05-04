# Token Burn Investigation — what's actually loading

70 CHF in a few hours on DoD + verify + ship = **~2.8M tokens**. With Opus input at ~25 CHF/MT, that's plausible if every step is loading large doc surfaces. Here's what I found in the repo.

---

## Smoking guns (ranked by impact)

### 1. `/review` reads 5–8 huge docs unconditionally

`.claude/skills/review/SKILL.md` lines 12–17:
```
- Always: docs/ARCHITECTURE.md, docs/work-packages/the canonical-shapes contracts under docs/
- If backend changes: docs/PROCESS_LAYER.md, docs/AGENT_LAYER.md, docs/KNOWLEDGE_ARCHITECTURE.md
- If frontend changes: docs/UI_DESIGN.md, docs/HUMAN_INTERFACE_LAYER.md, docs/INFORMATION_ARCHITECTURE.md
```

Actual line counts of those files:
- ARCHITECTURE.md: 772
- PROCESS_LAYER.md: 735
- KNOWLEDGE_ARCHITECTURE.md: 794
- HUMAN_INTERFACE_LAYER.md: **1,110**
- INFORMATION_ARCHITECTURE.md: 625
- AGENT_LAYER.md: 175
- UI_DESIGN.md: 169

A backend `/review` loads ~3,000 lines (~30K tokens) of doc preamble. A frontend `/review` loads ~3,500 lines (~35K tokens). The pipeline fires 4 specialist reviewers in parallel, each spawning fresh — that's potentially **140K tokens of doc reads per review phase**, before any code is examined.

### 2. `/architecture` and `/architecture-critique` cite the same docs

Combined "read 5 files" instruction. Same docs as /review. Effectively double-loaded across the pipeline.

### 3. Every sub-agent loads its `AGENT.md`

`.claude/agents/<role>/AGENT.md` ranges 46–137 lines. Per agent invocation, on top of CLAUDE.md (78 lines), the SKILL.md, and any cited rule files. Cumulative cost: ~3K per spawn × 17 spawns = ~50K just on agent boilerplate.

### 4. DoD rebuilds AC coverage by hand

`/check-definition-of-done` walks every acceptance criterion and re-reads the story file + matching test files to verify coverage. With 8–12 ACs per L-story, that's the spec read multiple times plus a sweep of test files in 4 packages.

### 5. `hooks: {}` is empty in `settings.json`

No PreToolUse hooks. No file-read deduplication. **Per the OpenWolf benchmark, 71% of file reads in a typical Claude Code session are files already opened in the same session.** ([Source](https://dev.to/cytostack/claude-code-used-25m-tokens-on-my-project-i-got-it-down-to-425k-with-6-hook-scripts-d40)) Without hooks, the same `docs/ARCHITECTURE.md` re-loads every time any sub-agent does its preamble.

### 6. Cross-skill citation density

Static count of doc citations across `.claude/skills/*/SKILL.md`:
- `docs/work-packages/the canonical-shapes contracts under docs/` cited 10×
- `docs/ARCHITECTURE.md` cited 6×
- `docs/UI_DESIGN.md` cited 5×
- `docs/HUMAN_INTERFACE_LAYER.md` cited 5× (the 1,110-line file)

These are static citations — every skill that runs hits them.

### 7. No `agentGuide` or pre-cached context

Anthropic's prompt cache requires identical prefix. Each sub-agent in this repo gets a slightly different preamble (different SKILL.md, different AGENT.md, different `$ARGUMENTS` position) — so caching isn't kicking in. The 90% discount on cache reads isn't applying.

---

## Rough math on a single L-story

A backend L-story running through the 17-step pipeline:

| Source | Per spawn | Spawns | Total |
|---|---|---|---|
| System scaffold (fixed) | ~10K | 17 | 170K |
| AGENT.md + CLAUDE.md + SKILL.md preamble | ~3K | 17 | 51K |
| Cited big docs (no caching) | ~25K | ~6 doc-heavy steps | 150K |
| Re-reads of story / tests / plan | ~10K | ~10 | 100K |
| Tool output (test/lint/diff) raw | ~8K | ~12 | 96K |
| **Estimated total per story** | | | **~570K** |

3 stories × 3 retries (or 1 story heavily re-iterated) easily hits 2–3M tokens. Matches your spend.

---

## Measurement — three ranked options

### Best: `ccusage` (today, 5 min)
```
npx ccusage@latest
npx ccusage@latest daily
npx ccusage@latest session
```
Parses `~/.claude/projects/<project>/*.jsonl` (Claude Code already writes these). Shows daily / per-session / per-model token & cost split. Cache reads vs writes broken out separately. Free, no API key. ([ccusage](https://github.com/ryoppippi/ccusage))

Run it now → you'll see *which* sessions burned the 2.8M, then narrow down which skills they ran.

### Better long-term: existing runner already captures usage
`packages/pipeline/src/runner.ts` line 65–66:
```
tokenCount: sys.usage?.total_tokens,
toolUses: sys.usage?.tool_uses,
```
The infrastructure exists. Surface `total_tokens` per step into `.pipeline/progress/<id>.toon`'s ledger and the retro reads it back. Then every story has a token receipt by step. **No new tooling, just plumbing what's already there into the brief.**

### Hook-based deduplication (medium effort, big payoff)
A `PreToolUse` hook on `Read` that logs file reads to a session-scoped JSON, and on a re-read returns "already in context — see message N". OpenWolf is the packaged version (6 Node.js hooks); cytostack reports 2.5M → 425K (~80% reduction). ([OpenWolf](https://github.com/cytostack/openwolf), [hooks reference](https://code.claude.com/docs/en/hooks))

Either install OpenWolf as-is or write a single 30-line hook that does just the dedup piece — the read-log is the only must-have, the rest is bonus.

---

## Should we switch to opencode?

**Probably not, but worth one A/B test.** OpenCode bills through your own API key, so per-agent costs land directly in the Anthropic dashboard with native granularity. The Claude Code `/usage` command famously doesn't break down by skill or session. ([OpenCode vs Claude Code](https://www.builder.io/blog/opencode-vs-claude-code))

But your pipeline is built around Claude Code's sub-agent model and skill loader. Switching means rewriting the runner. The pragmatic path:
- Keep Claude Code as the runtime.
- Add `ccusage` for visibility today.
- Add the `total_tokens` ledger for visibility per skill.
- Run *one* control story through opencode if you want to compare the bill — but don't migrate.

`AgentsView v0.22` covers Claude Code, OpenCode, Codex in one dashboard if you want a future-proof reporter. ([AgentsView](https://www.agentsview.io/token-usage/))

---

## Three actions for this week

1. **Right now (5 min):** `npx ccusage@latest session` — find which session ate the 70 CHF and cross-reference with which skills ran.
2. **This week (1–2 days):** Wire `total_tokens` from the SDK result message into `.pipeline/progress/<id>.toon` ledger. Pipe it into `/retro` so token spend per step is visible per story.
3. **This week (1 day):** Install one `PreToolUse` hook on `Read` that returns "already in context" on duplicate reads. Even the minimal version of OpenWolf's first hook should claw back ~30–50% of the cited-doc cost above.

These three together get measurement + the biggest single fix without touching the proposal in `token-efficiency-concept.md`. Then the structural work (TE-1…TE-13) compounds on top.

---

## Cross-link to concept doc

The smoking guns above map to specific TE items:
- #1 (review reads big docs) → **TE-10** (concept manifests + anchor reader). Single biggest lever.
- #2 (architecture cites same) → **TE-10** + **TE-9** (skill diet).
- #3 (AGENT.md per spawn) → **TE-7** (fewer spawns) + **TE-8** (caching).
- #4 (DoD rebuilds AC by hand) → **TE-12** (skill-local AC coverage script).
- #5 (no hooks) → **NEW: TE-14 — PreToolUse Read dedup hook**. Add to concept.
- #6 (citation density) → **TE-9 + TE-10** combined.
- #7 (no cache hits) → **TE-8** caching reorder, but only after TE-9 stabilizes shapes.

I'll add TE-14 (hook dedup) to the concept on next pass — it's the missing piece given how big a win OpenWolf reports.

---

## Sources

- [OpenWolf — 2.5M → 425K with 6 hooks (cytostack)](https://github.com/cytostack/openwolf)
- [DEV: Claude Code used 2.5M tokens, got down to 425K](https://dev.to/cytostack/claude-code-used-25m-tokens-on-my-project-i-got-it-down-to-425k-with-6-hook-scripts-d40)
- [ccusage CLI](https://github.com/ryoppippi/ccusage)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code costs guide](https://code.claude.com/docs/en/costs)
- [OpenCode vs Claude Code — Builder.io](https://www.builder.io/blog/opencode-vs-claude-code)
- [AgentsView token usage tracker](https://www.agentsview.io/token-usage/)
