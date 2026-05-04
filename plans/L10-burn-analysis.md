# L10 Burn Analysis — what the numbers actually say

## Cost breakdown (the real math)

Total story spend: **~$24.74** across 9 sessions.

| Bucket | Volume | Rate | Cost | % |
|---|---|---|---|---|
| Cache reads | ~22.6M | $0.50/M | **~$11.30** | 46% |
| Cache writes (5m) | ~1.14M | $6.25/M | **~$7.13** | 29% |
| Output | ~248K | $25/M | **~$6.20** | 25% |
| Base input | ~2K | $5/M | ~$0.01 | <1% |

**You misdiagnosed the leader.** Cache *reads* are the biggest line item (46%), not writes (29%). But cache writes are still bigger than output. So both matter.

---

## The five waste signatures the data exposes

### 1. Every session pays a cache-write tax for the same preamble
Cache writes per session: 47K (concept) → 264K (design). Floor of ~100K per session is roughly: CLAUDE.md (1K) + AGENT.md (~1K) + SKILL.md (1–6K) + story file + plan file + cited big docs. **Most of that floor is identical across sessions** — but cached *separately* in each, paying 1.25× input rate every time.

Rough estimate: 9 sessions × ~50K duplicate preamble × $6.25/M = **~$3 wasted on re-caching the same files.**

### 2. /design and /architecture already run their critic — but the pipeline lists separate skills
Your annotations confirm: `/design` runs design-critique internally, `/architecture` runs adversary internally. Yet the 17-step pipeline lists `/design-critique` (step 2) and `/architecture-critique` (step 4) as separate. **2 redundant skill invocations × ~$1.50 each = ~$3 wasted per story.**

### 3. The 3 scans all look at the same files — but pay 3 cache-write taxes
Your annotation: "/simplification-scan & /slop-scan & /adversary-review — all together they all look at all the files." Combined ~$2.26 across 3 skills with overlapping reads. One consolidated scan session would cost ~$0.80–$1.00. **Save ~$1–1.30.**

### 4. /verify isn't a skill, it's a script
Your annotation: "really runs all the steps manually and looks at the output." $2.06 for an agent to invoke `bun run check && lint && test && playwright`, read each output, summarize. A script does this in 0 tokens and emits one TOON line. **Save ~$2 entirely.**

### 5. /design always produces 3 variants
Your annotation: "always does 3 designs which is bit much for standard components." For a known component pattern, 1 variant + a "did we consider X, Y, Z" check is enough. The conditional logic costs less than 3 full HTML mockups + 3 critiques. /design at $5.05 is your most expensive single skill. **Conditional gating saves ~$2–3 on routine UI stories.**

### Plus the secondary signal Claude itself flagged
> Read results using 260.5k tokens (26%) → save ~78.2k

The agent re-read entire files when it needed slices. **TE-10 anchor reader and offset/limit-by-default in skill prose addresses this.**

---

## Answering your question: collapse sessions?

**Yes — but selectively, on coupling, not on convenience.** The data supports collapsing 9 sessions to ~4–5. Specifically:

| Today | Proposed | Why |
|---|---|---|
| /concept (often skipped) | (skip / read manifest) | Already happening |
| /design + /design-critique | **/design only** | Critique is already inside /design |
| /architecture + /architecture-critique | **/architecture only** | Adversary is already inside /architecture |
| /write-tests + /write-code | **one TDD session** | Same files, same intent. The "don't weaken tests" rule is a prompt instruction, not a context boundary. |
| /simp + /slop + /adversary-review | **one consolidated scan** | All look at the same files. Output is structured findings, not edits. |
| /architecture-review + /security-review + /design-review | **one multi-perspective review** | Same as above — findings only. Sub-perspectives are sections of one report. |
| /apply-review (×2) | **one applier** | Already proposed in TE-7 |
| /verify | **`bun run verify` script** | Not skill-worthy |
| /check-definition-of-done | **stays cold/separate** | Adversarial — must not inherit implementer's framing |
| /ship | **stays separate (light)** | Different tool permissions (push, gh PR) |

That's **4 active sessions + 1 cold DoD + 1 ship** = 6 sessions. Down from your measured 9 (and the spec's 17 steps).

Estimated saving on cache-write tax alone: 9 → 6 sessions × ~$0.80/session = **~$2.50/story**.

Plus the redundant-skill removal (#2): another **~$3/story**.

Plus consolidating the scans/reviews (#3): another **~$1/story**.

Plus killing /verify as a skill (#4): another **~$2/story**.

**Conservative total from session collapse alone: ~$8–10 saved on a $25 story** = ~35% reduction *before* any compression / hooks / doc splits.

---

## What the data does NOT support

- **Don't collapse author and critic** — your data shows /design ($5) and /architecture ($3.41) already do this, and they're your most expensive skills. Internal critique is fine *because the prompt switches mode*; what's wasted is *also* running an external skill that does the same thing.
- **Don't collapse implementer and DoD** — the auditor must enter cold. Cheap to keep separate ($1.48 typical for review-class), expensive to lose adversarial signal.
- **Don't keep one mega-session for the whole story** — context bloat hits autocompact (your data shows 33K autocompact buffer in every session). A 9-session pipeline forced into 1 mega-session would just keep losing state at compact-time. The win is in the *right* number of sessions, not the minimum.

---

## Top 5 actions ranked by ROI on this data

1. **Drop /design-critique and /architecture-critique from the 17-step list.** Pure spec cleanup, save ~$3/story instantly. (10 min edit to `/pipeline` SKILL.md)
2. **Convert /verify from skill to script.** Save ~$2/story. Replace skill body with: "run `bun run verify`, react to TOON report." (1 day to write the orchestrator script + TOON summary)
3. **Consolidate the 3 scans + 3 reviews each into one session.** Save ~$3/story. Two new skills replace six. (1 day refactor)
4. **Make /design conditional on novelty.** 1 variant for known patterns, 3 for genuinely new UI. Save ~$2–3/story on routine work. (Skill prompt change + a "novelty check" preamble)
5. **TE-14 PreToolUse Read dedup hook.** Even if cache writes per session stay the same, the dedup blocks the *re-loading* of files within a session. The 260K Read suggestion from Claude is exactly this. Saves ~$1–2/story. (Half-day to write hook)

Combined, just these 5 = **~$11–13 off the $25 bill** = 45–50% reduction from this analysis alone, *before* the structural TE-1…TE-16 work compounds on top.

---

## What this means for the concept doc

The data shifts priorities:

- **TE-7 (17→12 grouping)** becomes more important and more aggressive — the spec is wasting more than I estimated. New target: **17 → 6** sessions, not 12.
- **Removing skills** (not just merging) is cheaper than restructuring. Drop /design-critique, /architecture-critique, /verify outright. They're not adversarial-valuable in your current setup.
- **TE-14 (Read dedup hook)** still wins — Claude's own suggestion ("260.5k tokens, save 78.2k") is the read-dedup case stated in the product UI.
- **Cache-write reduction** is its own lever I underweighted. Every session collapse saves a fixed ~50K of duplicate preamble cached. Worth $0.30–0.60/session.
- **/design conditional gating** is a new TE: TE-17 — design variant gating.

Adding to the concept on next pass: **TE-17 — `/design` variant gating based on novelty + drop-list for skills the pipeline runs that are already covered inside other skills.**

---

## On the suggestion: "automatic caching across multi-turn"

Anthropic's automatic caching kicks in when you reuse the *same prefix* across turns. Your sessions ARE getting that benefit (that's why cache reads dwarf base input). What's NOT happening: cross-session cache reuse. Each fresh session pays a fresh cache write for the same preamble.

The fix isn't a setting — it's session topology. Fewer sessions → less cross-session cache write duplication. Same conclusion as above.
