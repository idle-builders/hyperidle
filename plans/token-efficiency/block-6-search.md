# Block 6 — Search & Static Helpers

**Cohort:** Round 1, parallel against `main`.
**Includes:** TE-11, TE-12, TE-15.

---

## Load-bearing claim

*Several persona phases spend 5–10K tokens reasoning about which tool to use and parsing free-form output. A single deterministic helper per query type cuts the reasoning *and* the output-parsing cost.*

This is the smallest, most utilitarian block. Three helpers wired once:

1. **Search dispatch** (TE-11) — regex → ripgrep, structural → ast-grep. Skills stop reasoning about which.
2. **AC coverage check** (TE-12) — Cold DoD's first-turn helper: parse story bullets, scan test descriptions, return `{covered, missing}`.
3. **TypeScript LSP via MCP** (TE-15) — `lsp_find_references`, `lsp_get_definition`, `lsp_get_type_errors`. Replaces grep-for-callers.

Where they live varies — dispatch is a global script, AC coverage is skill-local, LSP is an MCP server. But all three share the same shape: stop reasoning about *which tool*, wire the right tool once. The CLAUDE.md / hook surface is where the wiring lives.

## Value lever

**Cache reads** and **iteration count**. The smallest block in the cohort; A/B effects may be below dashboard noise. Ship cheaply if the helpers are easy; defer otherwise. Treated as a "we know it's right, ship it cheap" block, not a high-stakes bet.

## Risk profile

- **System complexity:** Medium. LSP-via-MCP is a long-running TypeScript language server with a supervision burden (memory, crash recovery). ast-grep is a new binary dependency. Per-harness MCP wiring. Complexity is high *for the marginal benefit* this block delivers.
- **Info-loss risk:** Low. LSP misses dynamic dispatch (string-keyed lookups, reflection); TE-12's regex AC parser breaks on prose-form acceptance criteria. Both are bounded edge cases.
- **Compounds with:** None meaningful — leaf block. May compound slightly with Block 4 (skill diet) since lean skills can cite `lsp_find_references` cleanly.

## Dependencies

- **Upstream:** Block 0 (need `hyperidle.tool_calls.minimum_estimate` to detect grep-vs-LSP-vs-AC-coverage waste). Otherwise none.
- **Downstream:** None directly. Leaf block.

## Shippability

Small. Reversible (delete script, remove MCP config, drop hook). Measurable but the savings are small enough that Block 0's dashboard noise may swallow them.

---

## TEs

### TE-11 — `bun run search` (global, ast-grep + ripgrep dispatch)

Single command: regex pattern → ripgrep, structural pattern (e.g., `useEffect($A, $B)`) → ast-grep. Skills stop reasoning about which tool to pick.

Lives at `scripts/search.ts`, root `package.json` script `"search": "bun run scripts/search.ts"`. Dispatches based on pattern syntax: contains `$A`-style metavariables → ast-grep; otherwise → ripgrep with sane defaults (line numbers, file types, context).

**Risk:** ast-grep adds a binary dependency, ripgrep is already there; the dispatcher script is a complexity trap. **Mitigation:** only ship TE-11 if Block 0 shows measurable token volume wasted on grep-vs-ast-grep reasoning. Otherwise drop.

### TE-12 — Skill-local AC coverage check

`.claude/skills/check-definition-of-done/ac-coverage.ts` parses the story file's bullets, scans test descriptions, returns TOON `{covered: [...], missing: [...]}`. Invoked by Cold DoD persona at start of phase.

**Lives where the skill lives** — only `/check-definition-of-done` uses it. No promotion to global script.

**Risk:** AC parser is regex over markdown bullets; story specs that use prose-form acceptance criteria break it. **Mitigation:** enforce bullet form in the work-package template; flag non-conforming stories at concept time.

### TE-15 — TypeScript LSP via MCP (tool-agnostic)

Wire a TypeScript language server as an MCP server (works in Claude Code, OpenCode, Hermes, anything that speaks MCP). Options: `typescript-language-server` exposed via `mizchi/typescript-mcp`, or LSMCP. Provides `lsp_find_references`, `lsp_get_definition`, `lsp_get_type_errors`.

**Why it's a candidate:** semantic queries (find-references, find-definition) are bounded LSP responses; grep equivalents drag big text blobs into context. Whether the operator cost of a long-running language server is worth the per-query saving is what the A/B measures.

**Where:** MCP config at the repo root (`mcp.json` or equivalent — every harness reads it). Skill prose cites `lsp_find_references` instead of "grep for callers".

**Risk:** LSP misses dynamic dispatch (string-keyed lookups, reflection); agent silently produces wrong results. **Mitigation:** prompt instruction in Reviewer persona — LSP first, fall back to ripgrep on suspicious negatives.

---

## How they reinforce each other

| Pair | Effect |
|---|---|
| TE-11 + TE-15 | LSP for semantic queries (find references, definitions); ast-grep / ripgrep dispatch (TE-11) for everything else. Three tools, clear lanes. |
| TE-12 + Cold DoD persona | Cold DoD's first turn becomes "run AC coverage script, read TOON, decide" instead of re-reading the spec and every test file. |

## How they could make each other worse

| Pair | Risk | Mitigation |
|---|---|---|
| TE-15 + LSP ambiguity | Find-references can miss dynamic usages (string-keyed dispatch, reflection) | Skills note: LSP first, fall back to ripgrep on negatives that look suspicious |
| TE-11 + complexity trap | ast-grep adds a binary dep when ripgrep already exists | Gate on Block 0 showing measurable grep-vs-ast-grep reasoning waste before shipping. Otherwise drop TE-11; keep TE-12 + TE-15. |

---

## Open questions / adversary attacks

- **TE-15:** "LSP misses dynamic dispatch (string-keyed lookups, reflection); agent silently produces wrong results." → LSP first, fall back to ripgrep on suspicious negatives. Encoded in Reviewer persona prompt.
- **TE-12:** "AC parser is regex over markdown bullets; story specs that use prose-form acceptance criteria break it." → Enforce bullet form in the work-package template; flag non-conforming stories at concept time.
- **TE-11:** "ast-grep adds a binary dependency, ripgrep is already there; the dispatcher script is a complexity trap." → Gate on Block 0 showing measurable token volume wasted on grep-vs-ast-grep reasoning. If the signal isn't there, drop TE-11 and ship just TE-12 + TE-15.

## A/B mechanics

- **Branch:** `block-6-search` off the locked baseline SHA.
- **Compared against:** `main` at the same SHA.
- **Stories:** 3 of mixed complexity (S / M / L). Stories with heavy reviewer or Cold DoD work surface this block's value most.
- **Primary signals:** Reviewer / Cold DoD turn count, `hyperidle.tool_calls.minimum_estimate` ratio for those personas, search-vs-grep tool call counts.
- **Ship rule:** ≥10% improvement on cost or wall-clock with no AC regression on all 3 stories. If signal is below dashboard noise, ship anyway only if the operator burden of LSP-via-MCP is low — otherwise defer to a later round.

---

## Files touched

- `scripts/search.ts` — TE-11 dispatcher.
- `package.json` — `"search": "bun run scripts/search.ts"`.
- `.claude/skills/check-definition-of-done/ac-coverage.ts` — TE-12 helper.
- `.claude/skills/check-definition-of-done/SKILL.md` — cite the helper at start of Cold DoD's phase.
- `mcp.json` (or harness equivalent) — TE-15 LSP server config.
- `.claude/agents/reviewer-*/AGENT.md` — cite `lsp_find_references` etc. instead of "grep for callers".
