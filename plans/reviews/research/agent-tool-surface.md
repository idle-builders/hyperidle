# Research — efficient tool surfaces for agents

Web research, 2026-09-10. Tagged **[M]** measured · **[P]** practitioner · **[V]** vendor claim.

## 1. Does tool count degrade accuracy?

**Real data, not folklore. It is a slope, not a cliff — and steeper for smaller models.**

| Source | Date | Models | Finding |
|---|---|---|---|
| RAG-MCP, arXiv 2505.03275 | 2025-05-06 | unnamed | tool-selection accuracy **13.62%** full catalogue vs **43.13%** with retrieval |
| HumanMCP, arXiv 2602.23367 | 2026-03-02 | GPT-4o-mini, Gemini 2.0 Flash, Claude 3.5 Haiku | ~88% at 100 tools. Gemini 2.0 Flash **87.4% @500 → ~76% @1,000 → 65% @2,000**. ~10pp lost just going 10→100. Retrieval+rerank recovered 65%→76%. *Failures are retrieval failures, not reasoning failures.* |
| GitHub Copilot | 2025-11-19 | GPT-5, Sonnet 4.5 | ~40 tools → **13 core + 4 virtual groups**. **+2–5pp** success on SWE-Lancer / SWE-bench-Verified, −400ms latency |
| Anthropic, *Advanced tool use* | 2025-11-24 | Opus 4, Opus 4.5 | Tool Search: Opus 4 **49% → 74%**; Opus 4.5 **79.5% → 88.1%** **[V]** |
| WorkBench, arXiv 2405.00823 | 2024 | — | all 26 tools vs only required toolkits: **49% → 43%** |

**The "10–15 tools" number circulating in 2026** comes from arXiv 2606.30317 (Rodrigues & Vas,
2026-06-29): Haiku 4.5 91% @10 → 87% @15; Sonnet 4 holds ≥90% to 20, drops by 30. **Caveat:
observational telemetry from one production voice-AI deployment, not a controlled benchmark.**
It is quoted far more confidently than its design supports.

**Contradicting it:** getunblocked (2026-05-16) sees quality drop at **50** and collapse at
**120**, recommending 30–40 always-loaded. Probably measuring a different failure mode —
10–15 is selection precision, 30–50 is task-level usability.

Anthropic's own intervention trigger: **10+ tools or >10K tokens of definitions.**

## 2. The dissent that matters most — overlap, not count

Sid Rao, *Deterministic Agents: The Facts, Mythology, and Mirage About Tool Counts*,
**2026-06-01**. Claude Haiku/Sonnet/Opus + GPT-5.5, 15 iterations per intent.

- Routing capacity ceiling ≈ **3.7–3.8 bits ≈ 14 distinguishable tools**.
- **The binding constraint is ambiguity and overlap, not cardinality.** 14 well-separated
  tools beat 8 overlapping ones.
- **The measurement warning:** Sonnet showed **perfect run-to-run repeatability (1.0) at only
  81% accuracy** — confidently and reproducibly routing to the wrong tool while silently
  abandoning most of its toolbox. Repeatability metrics will say everything is fine.

Two entirely different methods (Rao's bits, 2606.30317's telemetry) landing near 14 is the
strongest signal in this review.

## 3. Token cost, and what reduces it

Definition cost ≈ **100–1,000 tokens per tool**. Community audits of the same servers
disagree wildly (one publisher contradicted itself within two days on GitHub MCP: 93 tools /
~42–55K tokens vs 35 tools / ~26K). **Measure your own surface; don't trust these.**

| Technique | Source | Date | Claim |
|---|---|---|---|
| Tool Search Tool | Anthropic | 2025-11-24 | **~77K → ~8.7K tokens (85%)** plus the accuracy gains above |
| Code execution with MCP | Anthropic | 2025-11-04 | **150,000 → 2,000 tokens (98.7%)**. Needs a sandbox — "operational overhead and security considerations that direct tool calls avoid" |
| Programmatic Tool Calling | Anthropic | 2025-11-24 | 43,588 → 27,297 tokens (37%) |
| Dynamic toolsets | Speakeasy | 2025-11-18 | 96.7% input-token cut; constant cost at 40 or 400 tools **[V]** |
| Virtual tool groups | GitHub | 2025-11-19 | 40 → 13 + 4 groups |

**Chroma, *Context Rot* (2025):** all 18 frontier models show monotonically decreasing F1 as
input grows, at *every* increment — no safe zone below the limit. They isolate **distractor
interference**: semantically similar but irrelevant content actively misleads. A catalogue of
near-duplicate CRUD tools is exactly that.

## 4. Granularity — the evidence is thin and the practitioners contradict each other

**For consolidation:** Block Engineering, **2025-06-16**. Their Linear MCP went v1 **30+
tools** (one per GraphQL operation; "what issues is bob working on" took **4–6 calls**) → v2
grouped functions → v3 **two tools**: `execute_readonly_query` + `execute_mutation_query`.
Principle: *"design top-down from workflows, not bottom-up from API endpoints."* Each
iteration moved orchestration from the LLM into the server. **No accuracy numbers published.**

**Against it:** arXiv 2606.30317 (2026-06-29) names **"The God Tool"** as an anti-pattern and
prescribes decomposition — one named tool per distinct operation. Block's v3 *is* a God Tool.
Both 2026, flatly contradictory, neither with numbers.

**AWS** (2026-07-09) sides with decomposition, ≤8 parameters, and names the real tension:
**bloat** (definitions cost context every call) vs **confusion** (semantic similarity causes
wrong selection). Consolidation cures bloat and causes confusion inside one schema;
decomposition does the reverse.

**One hard data point:** PwC (2026-08-06) found JSON tool calling has a model-specific
**fan-out ceiling** — Claude Sonnet 5 holds 100% enumeration at N≤70 parallel calls, 75% at
N=72, **0% at N=100**. Programmatic calling held 100%. Narrow tools requiring wide fan-out
have a cliff-shaped failure mode a code-shaped surface does not.

**Nobody has run the clean experiment** — same capability set, fat-union vs narrow-decomposed,
same model, same eval.

## 5. CRUD vs intent shape

Consensus strong, measured evidence nearly absent.

- **Anthropic** (2025-09-11, still the canonical reference): implement **`schedule_event`**
  rather than `list_users` + `list_events` + `create_event`. *"More tools don't always lead to
  better outcomes."* Consolidate the multi-call sequences that appear in your real traces.
- **Block**: CRUD-mirroring forced 4–6 calls for one natural question.
- **Huß** (2026-08-06): *"Treating the API surface as the tool surface is the mistake."*
  Reports GitHub's MCP grew past 100 tools, degraded, and was cut back to ~40.
- **Where CRUD survives:** arXiv 2606.30317 keeps a **Resource Gateway** pattern for
  read-mostly access, distinct from a **Tool Orchestrator** for multi-step workflows. Read
  paths can stay resource-shaped; writes and multi-step paths should be intent-shaped.

### The identifier finding — cheap and measured

BoundaryML, *UUID swap* (~Oct 2025, relative-dated). 200 items / 100 class IDs, Claude Haiku,
two runs each. **Errors per session: UUIDs 48.5 · native integers 6 · UUID→int remapping 5.5.**
Roughly an **8× error reduction** from replacing opaque high-entropy identifiers with small
stable ones. Anthropic's guidance independently says prefer semantically meaningful IDs.

## 6. Naming and descriptions

- **[M] Descriptions are load-bearing and this has been ablated.** Removing tool and parameter
  descriptions (keeping names and types) significantly degraded performance across the board
  on ToolTalk. Selection depends *entirely* on natural-language description, not schema.
- **Namespacing scheme is empirical.** Service-prefixed (`asana_search`) vs resource-prefixed
  (`asana_projects_search`) "affects evaluation performance" — test both.
- Unambiguous parameter names (`user_id` not `user`); enums over free strings; write
  descriptions like onboarding a teammate.
- A **`response_format` enum** (`concise`/`detailed`) cut response tokens ~two-thirds.
- **[M] GitHub, *Better tools made Copilot code review worse*, 2026-07-10.** Migrating to
  objectively better shared tools made results worse — higher cost, fewer issues found. The
  tools weren't the problem, the *instructions* were. Rewriting prose gave **~20% lower cost
  at equal quality, surface held constant.**

## 7. MCP spec — current revision `2026-07-28`

Largest revision since launch. Relevant to surface design:

- **Tools are model-controlled**; resources are host/human-attached; prompts are user-invoked.
  The dividing line is *who decides when it runs*.
- **Tool sets MUST NOT vary per-connection, but MAY vary by authorization** — "returning only
  the tools the caller's granted scopes permit." **Per-role filtering is spec-sanctioned and
  needs no session.**
- **Deterministic ordering SHOULD be used**, for prompt-cache hit rates. `tools/list` is
  paginated and cacheable (`ttlMs`, `cacheScope`).
- **`inputSchema`/`outputSchema` are full JSON Schema 2020-12** — `oneOf`/`anyOf`/`allOf`,
  conditionals, `$ref`. This is what makes a discriminated-union tool expressible at all;
  it landed in this revision.
- **Names**: 1–128 chars, `[A-Za-z0-9_.-]`, unique **per server only**. The spec warns
  aggregating clients will collide and declines to solve namespacing.
- **Stateful tools**: no protocol session, so cross-call state must be an explicit **opaque
  handle** returned by a creation tool, authorization-checked on every call, with its retention
  policy stated in the creation tool's description.
- **`InputRequiredResult`** — a tool may return `resultType: "input_required"` with an
  elicitation request and `requestState`, and the client retries. **One tool can handle a
  missing-parameter round trip instead of shipping a separate lookup tool.**

## 8. Error and result design

The spec is the best short answer:

- **Protocol errors** (JSON-RPC `error`): unknown tool, malformed request — "issues with the
  request structure itself that models are **less likely to be able to fix**."
- **Tool execution errors** (`isError: true` in a normal result): API failures, validation,
  business logic — these "contain **actionable feedback that language models can use to
  self-correct and retry**." Clients **SHOULD** pass these to the model.
- The spec's own template: *"Invalid departure date: must be in the future. Current date is
  08/08/2025."* — what was wrong, what was expected, the value needed to fix it.
- Truncation should steer: "results truncated at N, use `offset`". Claude Code caps tool
  responses at **25,000 tokens** by default.

## 9. The counter-evidence that should shape the decision

**PwC, *The Bitter Lesson of Tool Calling*, arXiv 2608.06370, 2026-08-06.** BFCL v4, **14
models released Nov 2024 – Jul 2026**.

- 11 of 14 matched or beat baseline under programmatic tool calling; GPT-5.6 family **+10.6%**.
- Chaining (2–20 steps): Sonnet 5 **80.8% → 96.2%**, one LLM turn instead of two, ~50% lower
  latency for 13/14 models.
- Context flooding: JSON −2.3%; programmatic **+5.5%**; filesystem baseline −32%.
- **The actual bitter lesson:** the three failing models failed for a dumb surface reason —
  emitting literal `\n` escapes instead of newlines. "Generation trumps family." The gap
  closes with model maturity, not architecture.

**And from Anthropic's own table:** Tool Search moved Opus 4 by **+25pp** but Opus 4.5 by only
**+8.6pp**. *The benefit of aggressive tool-surface engineering is shrinking as models improve.*
That is the single most decision-relevant trend here, and it comes from the vendor selling the
technique.

**Also:** tool selection is necessary, not sufficient. An agent can select every tool correctly
and still fail. An eval that only asks "did it call the right tool" tests intent, not execution.

## What could not be found

1. **The clean granularity experiment** — nobody holds the capability set constant and compares
   fat-union vs narrow-decomposed on one model and eval. Every granularity claim here is a
   design narrative, a prescription, or an anti-pattern assertion.
2. **Measured CRUD-vs-intent comparison.** Block's 30→2 has no published before/after numbers.
3. Anthropic's Slack/Asana optimisation deltas (published as charts, no figures in prose).
4. The ICLR 2026 tool-selection-bias paper's contents — PDF extraction failed twice.
5. HumanMCP's full curves for the Claude and GPT models — only Gemini's came through, and all
   three tested models are small-tier, so the curve likely does not transfer to frontier models.
6. Any 2026 update to Anthropic's *Writing effective tools for agents* — still 2025-09-11 and
   still cited as current.
7. Public design reasoning from Slack. Third-party tool counts disagree (11 / 15 / 18) —
   plausibly because the list is scoped to the token's grants, per the spec.
8. Reproducible token audits. Every number in §3 is a one-off community measurement.
9. Anything on whether splitting a large surface across **sub-agents** beats deferred loading
   within one agent. Frequently asserted, never measured.

## Strongest sources

| Source | Date |
|---|---|
| Anthropic, *Writing effective tools for AI agents* | 2025-09-11 |
| Anthropic, *Advanced tool use* | 2025-11-24 |
| MCP specification 2026-07-28 — Tools | 2026-07-28 |
| GitHub, *Making Copilot smarter with fewer tools* | 2025-11-19 |
| PwC, *The Bitter Lesson of Tool Calling* (arXiv 2608.06370) | 2026-08-06 |
| Block, *Playbook for Designing MCP Servers* | 2025-06-16 |
| Sid Rao, *Deterministic Agents: … About Tool Counts* | 2026-06-01 |
| HumanMCP (arXiv 2602.23367) | 2026-03-02 |
| GitHub, *Better tools made Copilot code review worse* | 2026-07-10 |
