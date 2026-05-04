# Token Efficiency — Adversarial Review

## Verdict (one paragraph)

**REVISE.** The plan is competent strategy wrapped in indefensible arithmetic. The savings table on lines 417–435 sums to roughly **$55–70/story of claimed reduction against a $24.74 baseline** — a physical impossibility. The over-counting is not subtle; it comes from (a) double-booking the same dollars across at least four buckets (TE-7 persona-grouping, TE-14 read-dedup, TE-19 model-routing, and TE-20 memory-file all claim the cache-read/cache-write tax that totals $18.43), (b) a "TE-22+23+24+25+28 iteration efficiency" line worth $10–18 that has no anchor in the L10 cost mix, and (c) TE-27 single-shot at $5–10/story applied as if to the full $24.74 average rather than to the subset of stories that actually qualify. After deduplication, the **defensible aggregate is $12–17/story (50–70% reduction)**, landing L10 around **$8–12 full-pipeline** — not the $3–8 the doc claims. The genuinely high-leverage TEs are TE-19 (model routing), TE-7+TE-17 (persona collapse + redundant-skill drop), TE-10 (doc split), TE-14 (read-dedup), and TE-21 (verify/ship as scripts). Most others are either rounding noise (<$0.50/story), double-counted, or load-bearing on TE-19/TE-7 already being shipped. Single-shot (TE-27) is a real win but should be measured on qualifying stories only. LangSmith at $39/seat/month is a real recurring cost the savings column ignores entirely.

---

## 1. Math sanity check

### 1.1 The savings table does not add up

Summing the midpoints of every "Saves/story" range on lines 419–434:

| Bucket | TE | Range | Midpoint |
|---|---|---|---|
| Reporters & verify | 1+2+3+4 | ~$2 | $2.00 |
| Structured state | 5+6+20 | $3–5 | $4.00 |
| Persona grouping | 7+17 | $5–7 | $6.00 |
| Caching & docs | 8+9+10 | $3–4 | $3.50 |
| Search & helpers | 11+12+13+15 | $1–2 | $1.50 |
| Read dedup | 14 | $2–4 | $3.00 |
| Explorer | 16 | $2–3 | $2.50 |
| Design gating | 18 | $2–3 | $2.50 |
| Model routing | 19 | $6–8 | $7.00 |
| Continuous commit | 21 | $2–3 | $2.50 |
| Iteration efficiency | 22+23+24+25+28 | $10–18 | $14.00 |
| Single-shot | 27 | $5–10 (avg) | $7.50 |
| **Total** | | | **$55.50** |

Lower-bound sum: **$45**. Upper-bound: **$72**. Baseline: **$24.74**.

Even with optimistic interactions (savings compound multiplicatively rather than add), claiming to save $55.50 on $24.74 demands the system end up costing **negative $30.76 per story**. The table is not an estimate; it is a wishlist that hasn't been reconciled.

### 1.2 Where the over-counting comes from

The L10 cost is structurally bounded:

- **Cache reads $11.30** — this is the entire pool that TE-7 (persona dedup), TE-8 (prefix caching), TE-10 (doc split), TE-14 (read dedup), TE-20 (memory file), TE-25 (pre-fetch), and TE-28 (trajectory pruning) are all fishing in. Their claims sum to **$13–24** against a **$11.30** ceiling. This is the single largest source of double-counting.
- **Cache writes $7.13** — TE-7 explicitly attributes "~$5–7/story on cache-write tax + redundant-skill elimination, plus token volume ~280K cold-start tax". Cache writes are $7.13 in total. TE-7 cannot save $5–7 on a $7.13 bucket while TE-21 also drops "two whole sessions" worth of cache-write tax from the same bucket.
- **Output $6.20** — TE-19 (model routing) claims $6–8/story. Of that $6.20 output, $5.05 is `/design` and $4.43 is `/write-code`. Routing Builder to Sonnet caps the addressable savings on `/write-code` at roughly 60% of $4.43 = $2.66. Routing Architect stays Opus, so `/design`'s $5.05 is not addressable. Realistic ceiling for TE-19 output savings: **~$3.50**, not $6–8.
- **Base input $0.01** — irrelevant.

Total addressable pool: **$24.73**. Maximum theoretical saving: 100%. So the **upper bound on combined claims is $24.74**, full stop.

### 1.3 Specific overlaps the doc waves at but does not resolve

| Overlap | Doc's framing | Reality |
|---|---|---|
| TE-7 persona grouping vs TE-14 read-dedup | "Reinforces TE-7" (line 360) | Both target re-reading of preamble. TE-7 collapses sessions so preambles aren't repeated; TE-14 blocks the duplicate reads. The savings are the same dollars from different angles. Stack them and you double-count. |
| TE-19 model routing vs TE-7 grouping | "Persona shape from TE-7 is what makes per-persona model routing tractable" (line 366) | TE-19's "60–70% cheaper" benchmark is an industry mix that *includes* the structural compression TE-7 provides. Applying both at full claimed savings double-counts. |
| TE-20 memory file vs TE-25 pre-fetch | "Memory = static; pre-fetch = dynamic" (line 374) | They share a budget: the per-session preamble. If memory drops it from 50K to 2K, pre-fetch can't independently drop it from 50K to 2K again. |
| TE-22 plan-execute vs TE-19 model routing | "TE-22 reinforces TE-19" (line 371) | TE-22's "$2–3/story by preventing re-planning loops" is the same dollars TE-19 needs to *not lose* on Sonnet rework. They are not additive; TE-22 is a precondition for TE-19's claim, not a separate saving. |
| TE-27 single-shot vs everything | "30–50% of L-stories qualify" | If 40% of stories are single-shotted at $0.50 and 60% run the full pipeline, the *average* saving is mixed. The doc claims $5–10/qualifying story AND counts the other TEs against the full-pipeline 60%. Pick one denominator. |
| TE-21 drops `/verify` and `/ship` vs TE-3 verify orchestrator | TE-3 saves $2/story by collapsing four runs into one; TE-21 drops the skill entirely | If TE-21 ships, TE-3's savings are subsumed (no skill = no skill cost). They are not additive. |

### 1.4 The $10–18 "iteration efficiency" line is the worst offender

Bucket 11 stacks TE-22 + TE-23 + TE-24 + TE-25 + TE-28 and claims "~$10–18/story." The L10 mix has $24.74 total. To save $10–18 on iteration alone, you need to be deleting cache reads + cache writes simultaneously — but those buckets together are $18.43 and are *also* where TE-7, TE-14, TE-20, and TE-10 are claiming their savings. Five TEs cannot each capture a third of $18.43.

---

## 2. Per-TE plausibility on the headline numbers

### TE-3 verify orchestrator — $2/story (claimed via "80K/story")
**Plausible at the upper end.** 80K tokens at cache-read pricing ($0.50/M) is $0.04. At cache-write rates ($6.25/M) it's $0.50. At output ($25/M) it's $2.00. The doc doesn't say which, but the realistic mix is mostly cache, putting actual savings at **$0.30–0.80/story**, not $2. Counted as **~$0.50**.

### TE-6 handover brief — "100K/story"
Same pricing ambiguity. 100K cache-read tokens = $0.05. Real savings sub-$1. Counted as **~$0.50**.

### TE-7 persona grouping — $5–7/story
**Plausible only if you don't also claim TE-14, TE-20, TE-21.** Cold-start cache-write tax is $7.13 total across 9 sessions. Going from 9 sessions → 4 sessions cuts ~5/9 of the tax = **~$4 savings**. Plus eliminating two redundant skills (`/design-critique`, `/architecture-critique`) at TE-17 saves another ~$3 of duplicate session costs. **Defensible: $5–6/story IF TE-21 is not also counted** (TE-21 drops `/verify` + `/ship`, removing 2 more sessions whose cost is already inside the $7.13).

### TE-10 doc split + anchor reader — "150K/story"
Biggest single doc-side win, claimed. The three docs cited total ~2,640 lines. If a typical skill loads all three (it doesn't — most skills load one), that's at most 2,640 lines × ~30 tokens = ~80K tokens, then again per session × 9 = 720K theoretical max. Anchor reading cuts maybe 70%. So ceiling savings ~500K cache-read tokens = **$0.25**, or if these are partially cache-write, **~$3**. Plausible at **$2–3**, not $150K worth of any single price tier.

### TE-14 read-dedup — $2–4/story (claims 250–500K/story)
**OpenWolf 71% number verified** (132 sessions across 20 projects, 71% of file reads were repeats; 65.8% average token reduction). However: (a) OpenWolf's 65.8% is *aggregate token reduction including its index/anatomy system*, not just dedup; the dedup contribution alone is smaller; (b) hyperidle already has TE-7 collapsing 9 sessions to 4, which removes most cross-session repeats *before* dedup runs; (c) the savings on cached re-reads cost $0.50/M, so 400K saved tokens = **$0.20**. **Defensible only if reads are uncached**: writing-then-rereading hits cache-write at $6.25/M, where 200K = $1.25. Realistic: **$1–2/story standalone, $0.50–1 after TE-7 ships first.**

### TE-19 model routing — $6–8/story (the headline)
**Most aggressive single claim.** Output bucket is $6.20. Of that, `/design` ($5.05) stays Opus per the routing table. So Sonnet routing addresses `/write-code` ($4.43) + `/write-tests` ($3.50, partial) + `/scans+reviews` ($5.76, partial). Sonnet is roughly 1/3 of Opus output cost. Best-case savings on *output*: 0.66 × ($4.43 + $3.50 + $5.76 × 0.5) = **~$7**.

But: the claim ignores **rework risk**. If Sonnet has even a 15% rework rate that triggers a second Builder pass, the additional Sonnet cost + integration overhead claws back $1–2. And the claim assumes the "60–70% cheaper" routing-guide consensus applies to *novel TDD against locked plans*, which is not what those benchmarks measure.

**Defensible: $4–6/story, with a 20% probability of net $2/story if Sonnet rework is real.**

### TE-22 plan-execute discipline — $2–3/story
This is a **prompt rule**, not a structural change. It captures dollars only insofar as Builder was in fact re-planning, which is undocumented in the L10 retrospective. **Counted as: precondition for TE-19, not a separate saving. $0.**

### TE-23 parallel tool calling — $3–5/story
**Salesforce W&D 1.4×–3.7× verified** but the speedup is on *deep research agents with web tool calls*, where wall-clock dominates. For local file reads, parallel reading saves wall-clock but not many tokens — the same bytes still hit context. The "$3–5/story" claim requires reads to be cache-write (cold) on each turn, which is exactly what TE-8 + TE-20 are supposed to fix. **Either TE-8/TE-20 work and TE-23 saves <$1, or TE-8/TE-20 don't work and the whole architecture is leaking.** Counted as **$0.50–1**.

### TE-25 pre-prompt context pre-fetch — $2–4/story
Same pool as TE-20 memory file. Counted as **$0** standalone if TE-20 ships.

### TE-27 single-shot — $5–10/story (avg)
**Selection-bias trap.** The 30–50% qualifying figure is unsourced. Even if true: a CRUD-add story L10 likely costs $5–10 *full-pipeline*, not $24.74. The $24.74 is likely a complex story. Saving $5–10 on a $7 story means going to $0–2 — possible — but the *average* across mixed workload is **(0.4 × $6 saved) + (0.6 × $0)** = **$2.40/story**, not $5–10. Plus the doc handwaves the failure-loop cost: classifier wrong → CI fails → full pipeline runs → story now costs $24.74 + single-shot overhead. If false-positive rate is 20%, that's an expected cost of **~$1/story added**.

**Defensible average savings: $1–3/story across mixed workload.**

### TE-28 trajectory pruning — $2–4/story
"Quadratic cost of re-feeding" is real but already partially mitigated by Anthropic's prompt cache. With prefix caching working, the quadratic becomes ~linear in cache-read pricing. Savings shrink by 10×. **Defensible: $0.20–0.50/story** at current cache pricing.

### TE-29 LangSmith observability — $0 + recurring cost
**$39/seat/month verified** (Plus tier). Plus $2.50/1K traces overage above 10K. The doc treats this as "drives all measurement" with $0 cost. Reality:
- 1 seat × $39/month = **$1.30/day**.
- Pipeline likely emits 50–200 traces/story. At 5 stories/day = 250–1000 traces/day = 7.5K–30K/month, easily blowing the 10K free quota = **$50–100/month overage**.
- **Annualized recurring: ~$1,000–2,000/year.** Not free.

### TE-15 LSP via MCP — $30–50K/story
"LSP query: ~50ms, ~500 bytes. Grep equivalent: ~45s, ~10K tokens." The 45s grep number is implausible (`rg` finishes most repos in <2s). The 10K token number assumes the agent dumps the entire grep output into context, which it shouldn't. **Defensible: $0.20–0.50/story.** Plus TE-15 has hidden operator cost: long-running language server, MCP wiring per harness, drift when types change.

---

## 3. Citation verification (Explore-style web verification)

### 3.1 OpenWolf "71% of file reads are repeats" — **VERIFIED, with caveats**

Source: OpenWolf project (cytostack/openwolf on GitHub, agentnative.dev blog).
- 132 sessions across 20 projects.
- 71% of file reads were files Claude had already opened in the same session.
- Aggregate token reduction across the 20 projects: **65.8%** — but this includes OpenWolf's full stack (file-anatomy index + memory + ledger), not just dedup.

**Implication for TE-14:** The 71% read-repeat figure is real. The implied dollar savings are smaller than the doc suggests because (a) most repeat reads hit Anthropic's prompt cache at $0.50/M, not the full input rate; (b) hyperidle's TE-7 already removes most cross-session repeats before TE-14 runs.

### 3.2 ICML 2024 plan-and-execute "3.6× faster than ReAct" — **MISATTRIBUTED**

The "3.6×" figure traces to **LLMCompiler** (Kim et al.), which is an architecture paper about parallel DAG execution, not specifically "plan-and-execute" as a discipline. The actual ICML 2025 (not 2024) paper that *is* called "Plan-and-Act" (arxiv 2503.09572) does not headline the 3.6× number.

**Implication for TE-22:** The discipline ("don't re-plan in flight") is sound, but the 3.6× speedup is from architectural parallelism (LLMCompiler), not from the prompt rule TE-22 actually proposes. Citing it to justify $2–3/story savings is misleading.

### 3.3 Salesforce W&D "1.4×–3.7× speedup" — **VERIFIED**

Source: "W&D: Scaling Parallel Tool Calling for Efficient Deep Research Agents" (Salesforce AI Research). Confirms 1.4× lower latency on many tasks, up to 3.7× peak.

**Implication for TE-23:** Speedup is wall-clock, demonstrated on deep-research agents (web search, multi-source aggregation). Hyperidle's parallel reads are local files. The token-cost savings from parallelism are smaller than wall-clock savings — the doc conflates the two.

### 3.4 LangSmith "$39/seat/month, virtually 0% overhead" — **VERIFIED on price, ZERO COST CLAIM IS WRONG**

- $39/seat/month confirmed (Plus tier, 2026).
- 10K traces included; $2.50/1K overage.
- "Near-zero overhead" refers to *agent latency added by the SDK*, not to the *dollar cost of the seat*.

**Implication for TE-29:** The savings table omits a real $470–2,000/year cost. The recurring spend should be amortized against the savings to get net ROI.

### 3.5 Cognition "single decision-thread" pattern — **PLAUSIBLE BUT NOT QUANTIFIED**

The pattern (single decision-making thread + read-only sub-agents) is widely cited in agent literature but doesn't itself produce a cost number. It supports TE-7 directionally; it does not justify the $5–7/story.

### 3.6 Hermes `delegate_task` defaults — **NOT VERIFIED**

The doc cites "depth-1 cap, parent populates goal+context" as if from a public spec. No confirmation in standard agent-runtime literature; treat as informal.

---

## 4. Hidden costs the doc omits

| TE | Hidden cost |
|---|---|
| TE-2 vitest TOON reporter | Custom reporter = ongoing maintenance with every Vitest version bump; failure-mode debugging requires understanding both raw Vitest output and TOON layer. |
| TE-3 verify orchestrator | One more script the team owns. CI parity drift: local script vs CI YAML diverge silently. |
| TE-7 persona grouping | Non-trivial pipeline rewrite. Adversarial principle preservation requires careful prompt engineering — easy to backslide. |
| TE-10 doc split + anchor reader | Mass file rename invalidates every existing skill citation. Big PR, high regression risk. |
| TE-14 read-dedup hook | False-positive blocking is the failure mode the doc waves at; "mtime check" is not robust against in-memory edits, symlinks, or generated files. Per-harness wiring is real work. |
| TE-15 LSP via MCP | Long-running TypeScript language server consumes memory; needs supervision. MCP server crashes silently. |
| TE-19 model routing | Sonnet rework rate is the silent killer; needs measurement *before* claiming savings. |
| TE-21 continuous commit + ship-as-no-op | Every persona phase commits = noisy history; squash-on-merge mitigates but doesn't eliminate. CI feedback loop becomes the gating cycle — CI flakiness becomes pipeline flakiness. |
| TE-27 single-shot | Classifier maintenance; pattern-template library to keep in sync with codebase. False-positive cost is a full pipeline run *plus* the failed single-shot. |
| TE-28 trajectory pruning | Reasoning-continuity bugs are intermittent and hard to debug. |
| TE-29 LangSmith | $470–2,000/year, plus vendor lock-in despite OTel claims (queries and dashboards are LangSmith-specific). |

---

## 5. Failure-mode attack on the highest-savings claims

### TE-19 model routing — Sonnet Builder rework rate is the gating risk

The savings model assumes Sonnet executes a locked plan with the same fidelity as Opus. Reality: Sonnet on TDD against a locked plan with explicit types and route checklists is *probably* fine, but "probably" is doing heavy lifting in a $6–8/story claim. If rework rate is:

- **5%** → savings hold at ~$5–6/story.
- **15%** → savings drop to ~$2–3/story.
- **30%** → net negative once you include the cost of routing-back-to-Opus and integration churn.

There is no L10 measurement that establishes this rate. TE-19 should be conditional on TE-29 shipping first and showing rework rate <10%.

### TE-22 plan-execute — Blocker rate vs replan rate

The rule "don't redesign in-flight, raise as a blocker" is correct. But: if 30% of plans have ambiguities Builder *should* resolve in-flight, raising them as blockers triggers a full Architect re-engagement at Opus cost — *more expensive* than letting Sonnet resolve them. The doc's "retro tracks blocker rate" mitigation is post-hoc; the expected initial blocker rate is unknown.

### TE-27 single-shot — Qualifying-rate honesty

"30–50% of L-stories qualify" is a load-bearing number with no source. If qualifying rate is:

- **40%, success rate 90%** → avg savings ~$2.20/story across mixed workload.
- **40%, success rate 70%** → avg savings ~$0.50/story (failures cost more than they save).
- **20%, success rate 90%** → avg savings ~$1.10/story.

All scenarios are far below the doc's "$5–10/qualifying" headline (which is plausibly true *for the qualifying subset only*).

### TE-14 read-dedup — Subtle flow breakage

Real failure modes the doc doesn't address:
- Code-gen flows that write a file then re-read it for parsing (legitimate, often necessary).
- Schema migration where a file's *meaning* changed but mtime didn't (e.g., cached read, then `git checkout`).
- Multi-step refactors where the agent reads file A, edits B, then needs to re-read A to verify a cross-reference.

The "mtime check" mitigation handles file 1 but not 3.

---

## 6. CRITICAL / WARNINGS / OBSERVATIONS

### CRITICAL (must fix before proceeding)

1. **Savings table is internally inconsistent.** Sum exceeds baseline by 2.3×. Lines 417–435 must be rewritten with a single shared "addressable pool" denominator (cache reads $11.30, cache writes $7.13, output $6.20), and each TE must declare which pool(s) it draws from with explicit overlap accounting.

2. **TE-19 makes its single largest claim ($6–8) without measurement.** Sonnet rework rate on TDD-locked-plan workloads is unknown. The TE should be **gated on TE-29 shipping first** and an A/B run of 10 stories establishing rework rate <10%. No commitment to Sonnet routing until that data exists.

3. **TE-29's $470–2,000/year recurring cost is missing from the savings column.** Either net it out, or commit to self-hosted Langfuse from Day 1 (which has its own ~15% overhead the doc acknowledges only in passing).

### WARNINGS (significant risk)

4. **TE-22 cited as worth $2–3/story is double-counting TE-19's prerequisite.** Re-state TE-22 as "precondition for TE-19" and remove its standalone saving.

5. **TE-25 + TE-20 fish in the same pool.** Pick one as primary, declare the other as marginal compounding.

6. **TE-27's "30–50% qualify" needs a source or a measurement plan.** Currently a vibes number driving $5–10/story claims.

7. **TE-23 conflates wall-clock speedup with token savings.** Salesforce W&D measures latency, not cost. Re-state TE-23 as "developer-time win, ~$0.50/story token win."

8. **TE-15's "45s grep vs 50ms LSP" is implausible.** ripgrep is ~1–2s on this codebase. Re-derive from real measurement.

9. **ICML "3.6× faster than ReAct" is misattributed.** The number is from LLMCompiler (architectural parallelism), not from plan-execute discipline. TE-22's citation needs correction.

### OBSERVATIONS

10. **TEs <$0.50/story shouldn't be in the table at all.** TE-11, TE-12, TE-13, TE-26 all noise. They aren't wrong, but listing them in a savings table makes the table indefensible. Move to a "directionally correct, marginal" bucket.

11. **The sequencing list (lines 442–467) is mostly correct** despite the broken arithmetic. TE-29 first is right (you can't optimize what you don't measure). TE-17 second is right (10-minute spec edit, immediate $3). TE-19 third is risky without data.

12. **TE-7 + TE-21 together are the structural win.** Going 9 sessions → 2 (Architect + Builder, with reviewers as workers, verify/ship as scripts, Cold DoD as a thin reader) is where the cache-write tax actually drops.

---

## 7. Defensible savings ranking — Top N that actually move the needle

After deduplication, with each TE attributed to its primary cost pool and overlaps removed:

| Rank | TE | Primary mechanism | Defensible savings | Confidence |
|---|---|---|---|---|
| 1 | **TE-19** model routing | Output bucket: route Builder + non-adversarial reviewers to Sonnet | **$3–6/story** | Medium (gated on rework rate measurement) |
| 2 | **TE-7 + TE-17** persona collapse + drop redundant skills | Cache-write bucket: 9 sessions → 4 + drop critique-as-skill | **$3–5/story** | High (structural; removes specific session count) |
| 3 | **TE-21** verify+ship as scripts | Cache-write bucket: drops 2 more sessions | **$1.50–2.50/story** | High (strict subset of skill removals) |
| 4 | **TE-10** doc split + anchor reader | Cache-read bucket: less preamble per skill load | **$1.50–2.50/story** | High (mechanical, measurable) |
| 5 | **TE-14** read-dedup hook | Cache-read + occasional cache-write savings | **$1–2/story** (after TE-7) | Medium (reduces post-TE-7) |
| 6 | **TE-27** single-shot for known patterns | Whole-pipeline skip on qualifying subset | **$1–3/story (mixed avg)** | Low (qualifying rate unsourced) |
| 7 | **TE-18** /design variant gating | Output bucket: routine UI = 1 variant | **$1–2/story** | Medium (depends on routine-vs-novel mix) |
| 8 | **TE-29** observability | $0 saving + $40–170/month cost | **−$0.50/story (cost)** | High (cost is real, savings are indirect via measurement) |
| 9 | **TE-1+2+3+4** reporters + verify orchestrator | Output bucket on test failure paths | **$0.50–1/story** | High |
| 10 | **TE-20** memory file | Cache-write bucket: per-persona preamble | **$0.50–1/story** (after TE-7) | Medium |

**Aggregate (with overlap discipline):** **$11–25/story**, midpoint **~$15/story**. Lands L10 at **~$10/story full-pipeline**, **~$6/story** when single-shot eligible. Half the doc's $3–8 claim, still a 60% reduction.

### TEs that are double-counted, marginal, or unverified

- **TE-2, TE-5, TE-6**: Structural plumbing, savings <$1 each, fold into TE-3/TE-7 narratives.
- **TE-8 caching prefixes**: Already partly captured by Anthropic's automatic prefix cache; standalone savings near zero.
- **TE-9 skill diet**: Good hygiene; savings <$0.50/story.
- **TE-11 search dispatch**: Convenience win; <$0.50/story.
- **TE-12, TE-13**: Implementation details, not separate savings.
- **TE-15 LSP via MCP**: Operationally heavy for $0.20–0.50/story. Defer until LSP usage is justified by review-time pain, not by cost claims.
- **TE-16 Explorer**: Subsumed by TE-19 once cheap-model routing is general; the "Explorer" is just "Sonnet/Haiku reviewer doing read-only work."
- **TE-22**: Precondition for TE-19, not a separate saving.
- **TE-23 parallel tool calls**: Wall-clock win, ~$0.50/story token win.
- **TE-24 interleaved thinking**: One flag, ~$0.50/story.
- **TE-25 pre-fetch**: Subsumed by TE-20.
- **TE-26 step-efficiency metric**: Measurement, not savings.
- **TE-28 trajectory pruning**: $0.20–0.50/story given existing prompt cache.

---

## 8. Recommended actions

1. **Rewrite the savings table** with explicit pool attribution. Each TE declares (read-cache | write-cache | output) and what fraction of that pool it captures. Sum within each pool must not exceed pool size.
2. **Reframe TE-22, TE-23, TE-24, TE-25, TE-28** as preconditions or marginal compounding, not standalone savings. Remove the $10–18 "iteration efficiency" line.
3. **Add a recurring-cost row** for TE-29 ($40–170/month). Net it against savings.
4. **Gate TE-19 on a 10-story A/B** measuring Sonnet Builder rework rate. Do not commit to $6–8/story until rework rate is <10%.
5. **Source-check or remove** the "30–50% qualify" claim in TE-27. Replace with a measurement plan: classify last 20 stories retrospectively, report qualifying rate.
6. **Fix the ICML 2024 / LLMCompiler citation** in TE-22. The 3.6× number is architectural, not disciplinary.
7. **Drop TEs with <$0.50/story savings from the table.** Keep them in a separate "directionally correct, low-effort" appendix if desired.

**Final number to claim publicly: L10 $24.74 → $9–12 full-pipeline, $5–8 single-shot eligible.** That's a 50–70% reduction — defensible, and still a strong story. The 70%+ claim is not.

### VERDICT: REVISE
