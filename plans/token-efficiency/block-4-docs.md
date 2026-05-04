# Block 4 — Read & Doc Topology (cache architecture)

**Cohort:** Round 1, parallel against `main`.
**Includes:** TE-8, TE-9, TE-10, TE-14. (TE-28 deferred — see "Deferred" below.)

---

## Load-bearing claim

*The dominant cost on L10 is the same bytes being read, written, or re-fed multiple times — at the file layer, at the skill-prompt layer, at the cache-prefix layer, and within a session's read history. Compress at every layer and the caches do the rest.*

This block attacks the largest L10 bucket directly: cache reads at 46% of total, with Claude's UI flagging 260.5K Read-result tokens (26% of total) as save-candidates of ~78.2K, and the OpenWolf benchmark showing 71% of file reads as within-session repeats.

## Value lever

- **Cache reads** — TE-10 anchor reading shrinks per-skill load; TE-14 dedup blocks repeats.
- **Cache writes** — TE-8 stabilizes prefixes so cold-cache writes shrink.
- **Output tokens** — unaffected.

The OpenWolf 71%-duplicate-reads observation is the structural argument; A/B'd in round 1 (before Block 1b collapses sessions) catches the headroom while it's still there. Once Block 1b lands, cross-session preamble repeats drop, and Block 4's residual headroom shrinks. Run round-1 A/B independently from main; combined number captured in the post-merge stack A/B.

## Risk profile

- **System complexity:** Medium-High. Doc restructuring touches every skill citation; the read-dedup hook is a small script but per-harness wiring (Claude Code hook config differs from OpenCode / Hermes); skill-diet pass touches all 27 SKILL.md files. Internal sequencing (TE-9 → TE-10 → TE-8 → TE-14) is mandatory within the block.
- **Info-loss risk:** Medium. Anchor reads miss prose nuance the full-doc read carries (mitigation: `/concept` always reads full prose). Read-dedup hook can block legitimate re-reads of files whose meaning changed without an mtime bump (cached read → `git checkout` is the canonical case; mitigation: re-read allowed if mtime > cached-read time, or after a Write/Edit on the same path).
- **Compounds with:** Round 3 (stable prefixes amplify cheap-model savings — Sonnet's prefix-cache hit rate is what makes Round 3 multiplicative not additive). Internal compounding within the block: TE-9 → TE-10 → TE-8 → TE-14 must run in order.

## Dependencies

- **Upstream:** Block 0 (cache-hit-ratio dashboard for validation). Internal: TE-9 must precede TE-8 within the block — restructuring skills invalidates the prefix cache.
- **Downstream:** Round 3 (cheap-model personas need stable prefixes to actually save money — Opus prefix-cache reads at $1.50/M but Sonnet at $0.30/M; Block 4 is what makes the cheap-model flip multiplicative).

## Shippability

Medium-Large. TE-14 is one Bun script + one hook config = small. TE-10 is a doc-restructure pass = mechanical but touches every skill that cites a doc. TE-9 is a careful prose pass on 27 SKILL.md files. Reversible per file but expensive to revert in aggregate. Measurable directly via `hyperidle.cache.hit_ratio` (Block 0 attribute).

---

## Internal order — sequence inside the branch

Mandatory order within `block-4-docs`:

1. **TE-9 (skill diet)** first — let the skill shapes settle.
2. **TE-10 (concept manifests + CLAUDE.md split + anchor reader)** — skills now cite anchors instead of whole docs.
3. **TE-8 (caching-friendly skill prefixes)** — only after the prior two settle, otherwise prefix cache invalidates on every edit.
4. **TE-14 (read deduplicator hook)** — last; catches whatever in-session repeats remain after the prior three.

Each step lands as one commit on the branch; the A/B reads the final state.

---

## TEs

### TE-9 — Skill diet

Review what parts of each skill drive excessive file calling or loading. Skill *length* is not the issue (500 tokens); skill *structure* is (poorly-structured skill = 50K tokens of agent activity). Skills should ship with their write-tools and scripts side-by-side. Split each skill into doing one thing end-to-end. Composite skills become thin orchestrators that say "call these X skills in this order with this agent" — they don't re-explain.

**Risk:** trimming descriptions breaks skill-discovery triggering. **Mitigation:** touch only body prose; frontmatter `description` and triggers stay.

### TE-10 — Concept manifests + CLAUDE.md split + anchor reader

Today `HUMAN_INTERFACE_LAYER.md` is 1,110 lines, `PROCESS_LAYER.md` 735, `KNOWLEDGE_ARCHITECTURE.md` 794. Split each into per-topic files. Add `<!-- @anchor: name -->` markers throughout. Global `bun run docs:read <file>#<anchor>` returns just that section (small Bun script, ~20 lines). Skills cite anchors: `docs/concept/PROCESS_LAYER.md#thread-lifecycle`. CLAUDE.md splits the same way — keep top 30 lines (absolute rules + index); move tech stack / commands / git policy / web-research warnings to `.claude/rules/`.

### TE-8 — Caching-friendly skill prefixes

Mechanical pass over all SKILL.md files: move `$ARGUMENTS` to the bottom under a `## Target` section. Stable preamble first → Anthropic prefix-cache hits → cache reads cost 10% of input.

**Conflicts with TE-9 if skills are restructured at the same time** — sequence: TE-9 first, then TE-8 once skill shapes settle.

### TE-14 — Read deduplicator hook (tool-agnostic pre-tool hook)

A pre-tool-use hook (`.claude/hooks/read-dedup.ts` for Claude Code; equivalent for OpenCode / Hermes — every harness ships a similar primitive) keeps a session-scoped map of already-read files. On a duplicate Read, returns `{decision: "block", reason: "already in context — see message N"}`. Forces the agent to reference prior content instead of re-loading.

**Background.** OpenWolf benchmarks observed 71% of file reads were repeats within-session across 132 sessions; that's the structural signal. Whether dedup captures meaningful additional savings *after* Block 1b collapses sessions is an open question — the round-1 A/B (before Block 1b lands) is the answer; run it now to capture the pool while it's full.

**Risk:** false positives on files that legitimately changed mid-session. **Mitigation:** allow re-read if file mtime is newer than the cached read, or after a Write/Edit on the same path.

**Tool-agnostic note:** the dedup *script* is portable (one Bun file). Only the wiring (which hook config file points at it) varies per harness.

---

## Deferred — TE-28 (trajectory pruning)

Hermes-pattern `ContextCompressor` at 50% threshold strips intermediate tool-call results from the persona's trajectory and replaces them with a brief summary.

**Reason for deferral:** Block 2 (briefs + memory + pre-fetch) already keeps persona trajectories short by design. Profile first: if persona phases routinely exceed the 50% threshold post-Block-2, TE-28 is essential; if they don't, TE-28 is dead weight protecting against a problem the rest of the architecture already solves.

**Action:** ship Block 4 without TE-28. Revisit only if Block 0 dashboards show trajectories crossing 50%.

---

## How they reinforce each other

| Pair | Effect |
|---|---|
| TE-8 + TE-10 | Smaller cited docs = smaller stable prefix = more overlap = better cache hit rate. |
| TE-9 + TE-10 | Both shrink "stuff agents must read"; together skill files become tight pointers into rules. |
| TE-14 + everything | Read-dedup hook saves tokens *under* every other skill, with no skill changes required. |
| TE-9 → TE-8 | Skill diet first lets shapes settle; then caching reorder doesn't keep invalidating. |

## How they could make each other worse

| Pair | Risk | Mitigation |
|---|---|---|
| TE-8 + TE-9 | Restructuring skills invalidates the prefix cache | Sequence: TE-9 (diet) first; TE-8 (caching reorder) only when shapes settle |
| TE-9 + skill triggering | Trimming descriptions breaks `/skill` discovery | Touch only body prose; frontmatter `description` and triggers stay |
| TE-10 + concept loss | Manifest-only reads miss nuance the prose carries | `/concept` always reads full prose; downstream skills can request prose if confused (cheap fallback) |
| TE-14 + legitimate re-reads | Hook blocks re-read of a file that was just edited | Whitelist: re-read allowed if file mtime > cached-read time, or after a Write / Edit on the same path |
| TE-14 + TE-10 double-count | Both attack the "260.5K → save 78.2K" pool; running them as independent A/Bs would double-credit | They ship as one block; combined A/B is the number. Internal commit order lets us see TE-10's contribution alone, then TE-14's marginal delta. |

---

## Open questions / adversary attacks

- **TE-14:** "Hook blocks re-read of a file just edited; agent fails because it can't see its own writes." → Re-read allowed if mtime > cached-read time, or after Write/Edit on that path. Snapshot test that Read after Edit is permitted.
- **TE-10:** "Anchor reads miss prose nuance; concept work degrades silently." → `/concept` always reads full prose; downstream skills can fall back. Block 0 dashboard tracks `/concept` cost separately and flags regression.
- **TE-8:** "Prefix-cache hit rate depends on Anthropic's specific implementation; this stops working if we move harnesses." → Prefix-cache benefit is generic to LLM APIs (every major provider has it now). Block 4's value survives a harness swap.
- **Double-counting risk:** TE-14 (read-dedup) and TE-10 (anchor reader) both attack the same 260.5K-token pool. They ship as one block; the round-1 A/B captures the combined number against `main`. If we want to attribute, the internal commit order (TE-10 first, then TE-14) lets us read intermediate metrics from Block 0 — but the headline is the combined delta.
- **Pool drain by Block 1b:** Block 1b will collapse cross-session preamble repeats, removing some of what TE-14 was going to fish in. Round-1 A/B against current `main` captures the headroom while it's still there. Combined post-merge A/B (block-1a + 2 + 4 + 6) measures the actual stack.

## A/B mechanics

- **Branch:** `block-4-docs` off the locked baseline SHA.
- **Compared against:** `main` at the same SHA.
- **Stories:** 3 of mixed complexity (S / M / L).
- **Primary signals:** total cache-read tokens, `hyperidle.cache.hit_ratio`, count of Read tool calls per persona, blocked-by-dedup count.
- **Ship rule:** ≥10% improvement on cost or wall-clock with no AC regression on all 3 stories. The within-block sequence (TE-9 → TE-10 → TE-8 → TE-14) lets us read intermediate metrics, but the ship decision is on the final state.

---

## Files touched

- `docs/HUMAN_INTERFACE_LAYER.md`, `docs/PROCESS_LAYER.md`, `docs/KNOWLEDGE_ARCHITECTURE.md`, `docs/ARCHITECTURE.md`, etc. — split into per-topic files with `<!-- @anchor: name -->` markers.
- `CLAUDE.md` — top 30 lines kept; rest moved to `.claude/rules/`.
- `.claude/rules/<topic>.md` — new files for tech stack / commands / git policy / web research.
- `.claude/skills/<skill>/SKILL.md` (all 27) — skill diet pass + `## Target` section moved to bottom.
- `scripts/docs-read.ts` — anchor reader script.
- `package.json` — `"docs:read": "bun run scripts/docs-read.ts"`.
- `.claude/hooks/read-dedup.ts` — pre-tool-use hook.
- `.claude/settings.json` — hook wiring.
