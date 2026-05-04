# Agent Observability Plan — measure first, optimize second

The optimization mindset works only with measurement. Treat each agent call like a page-view, each iteration like a click event, each persona session like a user-flow. Then you can find hot spots, build funnels, and prove TE-* impact instead of guessing.

The good news: this is a *solved* category in 2026. The whole stack exists, including a portability standard.

---

## The portability layer: OpenTelemetry GenAI Semantic Conventions

OTel published a standard vocabulary for LLM/agent spans (status: experimental but adopted everywhere). Same span shape from a LangChain agent, raw OpenAI call, Claude Code session, OpenCode subagent. ([OTel GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/), [Datadog OTel GenAI native support](https://www.datadoghq.com/blog/llm-otel-semantic-convention/))

**Implication for HyperIdle:** instrument once with OTel. Switch from Claude Code → OpenCode → Hermes → Pi without losing the dashboard. The data follows the agent.

---

## What every modern harness already emits

| Harness | Built-in observability | How to enable |
|---|---|---|
| **Claude Code** | OTel spans around every model request + tool execution; metrics for tokens/cost; structured logs for prompts/results. Exports: session count, LOC, PR count, commit count, cost per session, token usage by model, edit decisions, active time. | `CLAUDE_CODE_ENABLE_TELEMETRY=1` + OTLP endpoint env vars. ([Claude Code OTel docs](https://code.claude.com/docs/en/agent-sdk/observability)) |
| **OpenCode** | Native OTel. | OTLP env vars, no code changes. ([Dynatrace coverage](https://www.dynatrace.com/news/blog/dynatrace-expands-ai-coding-agent-monitoring/)) |
| **Hermes** | JSONL trajectory file per session, append-only. Designed for post-hoc analysis and training-data generation. | On by default. ([Ken Huang chapter on Claude Code vs Hermes observability](https://kenhuangus.substack.com/p/chapter-9-observability-and-debugging)) |
| **Pi** | RPC mode emits structured JSON over stdio. | `--rpc` flag. |

**Three of the four already speak OTel.** Hermes' JSONL is convertible to OTel via a small adapter.

---

## Backend choice — pick one, don't sprawl

| Platform | Best for | Pricing | Overhead |
|---|---|---|---|
| **Langfuse (self-host)** | Open-source, full data control, fits "user behavior analytics" framing | Free self-hosted; cloud Core $29/mo (100K units, ≈8K traces) | ~15% |
| **LangSmith** | Deep LangChain/LangGraph tracing, lowest overhead | $39/seat/month | virtually 0% |
| **Arize Phoenix** | ML-heritage teams, strong eval primitives | $10/M spans over limit | low |
| **Helicone** | Easiest install (proxy-based) — change one base URL | Zero markup on LLM costs | proxy latency only |
| **Datadog LLM Observability** | If you already pay Datadog | Datadog pricing | low |

**Recommendation for HyperIdle: self-hosted Langfuse.**

Why: open-source, you keep all your trace data, fits the "treat agents like users" framing perfectly (Langfuse already has session/user/feature tagging). Per-unit pricing is irrelevant on self-host. Tradeoff is the 15% overhead — acceptable for an internal pipeline. ([Langfuse observability docs](https://langfuse.com/docs/observability/overview), [Langfuse Alternatives 2026](https://laminar.sh/article/langfuse-alternatives-2026))

If you want zero ops: Helicone proxy is a one-line install but shallower depth — works for cost-only dashboards, weaker for iteration analysis.

---

## Custom span attributes for HyperIdle-specific concepts

OTel out-of-the-box gives you per-call tokens/cost/latency/model. To get *persona-level* and *story-level* analytics, add custom attributes:

```
hyperidle.story.id          = "L10"
hyperidle.story.complexity  = "L" | "M" | "S"
hyperidle.story.pattern     = "novel" | "crud" | "schema-add" | "ui-only" | ...
hyperidle.persona           = "architect" | "builder" | "reviewer-arch" | "reviewer-security" | "reviewer-design" | "reviewer-adversarial" | "cold-dod" | "reflector" | "explorer-worker"
hyperidle.phase             = "concept" | "design" | "architecture" | "write-tests" | "write-code" | "apply-review" | "dod" | "retro"
hyperidle.iteration         = 1, 2, 3, ...
hyperidle.replan_count      = N (incremented each time builder re-plans)
hyperidle.tool_calls.parallel = N (how many tools batched in this turn)
hyperidle.tool_calls.minimum_estimate = N (for step efficiency metric, TE-26)
hyperidle.cache.hit_ratio   = 0.0–1.0
hyperidle.brief.injected    = true | false
```

These attributes are added in `packages/pipeline/src/runner.ts` when the runner spawns each persona. Already half-instrumented (`tokenCount: sys.usage?.total_tokens` at line 65). Wrap that in an OTel span with the above attributes.

---

## The five views the dashboard needs

Treat this like product analytics. Five views that mirror Mixpanel/Amplitude for users:

### 1. Cost heatmap (story × persona)
Rows = stories, columns = personas. Cell = cost. Hot spots jump out visually. Today's L10 row would show `architect $10 / builder $10 / reviewers $5.76 / dod $1.50 / verify $2`. After TE-19 routing, the row becomes mostly cool with one Opus column.

### 2. Iteration flame graph (per story)
X = wall-clock time, Y = persona stack depth. Width = cost. Lets you spot "Builder ran 73 iterations, 50 of which were `read foo.ts`" at a glance. ([Flame graph fundamentals](https://www.brendangregg.com/FlameGraphs/cpuflamegraphs.html))

### 3. Story funnel
Stories started → Architect locked plan → Builder reached green → Reviewers passed → Cold DoD approved → Shipped. Drop-off at each stage = where stories go to die. Same shape as web funnel analytics.

### 4. Hot spot table (top 10 costliest phases across all stories last week)
"`/design` accounts for 31% of total cost across the last 7 stories." Drives prioritization of TE-* work — fix the hot spot first.

### 5. Retro effectiveness (cost trend per skill over time)
Y = avg cost for skill X across stories. Bend points correlate with retro lessons applied. Validates that the compounding mechanism works.

---

## Step-by-step rollout

1. **Day 1: turn on the firehose.** Set `CLAUDE_CODE_ENABLE_TELEMETRY=1`. Spin up Langfuse via Docker (`docker compose up`). Point OTLP at it. Done.
2. **Day 2: add custom attributes.** Edit `packages/pipeline/src/runner.ts` to wrap each persona spawn in an OTel span with the `hyperidle.*` attributes above. Use the OTel JS SDK.
3. **Day 3: add `tool_calls.minimum_estimate` heuristic.** Per-skill estimate baked into the SKILL.md frontmatter. Runner reads it. Step efficiency = actual / minimum.
4. **Day 4: build the five views in Langfuse.** Langfuse has dashboarding; the heatmap and flame graph are standard widgets.
5. **Day 5: bake `ccusage` summary into `/retro`.** Cheap secondary signal. ([ccusage CLI](https://github.com/ryoppippi/ccusage))
6. **Week 2+: iterate.** Pick the worst hot spot from view #4. Apply the relevant TE. Measure. Repeat.

---

## Crossing harnesses

When/if HyperIdle moves to OpenCode or Hermes:

- **OpenCode:** OTLP env vars; same Langfuse instance picks up the spans. Custom attributes need to be re-added in whatever wraps the persona spawn (OpenCode's agent definition file or hook).
- **Hermes:** write a small adapter (~50 lines) that watches the JSONL trajectory file, parses each turn, emits OTel spans with the same `hyperidle.*` attributes. Runs as a sidecar.
- **Pi:** consume the RPC stdio JSON, same adapter pattern.

The dashboard, the queries, the historical comparisons — all survive the harness migration *because* the OTel schema is the contract.

---

## What this measurement enables (the optimization loop)

Treating the pipeline like a product:

| Question | View answers |
|---|---|
| "Where does cost go on a typical L-story?" | Cost heatmap |
| "Which persona burns the most iterations?" | Iteration flame graph |
| "Where do stories fail / get stuck?" | Story funnel |
| "What's the highest-ROI fix to ship next?" | Hot spot table |
| "Did last sprint's retro lessons actually reduce cost?" | Retro effectiveness trend |
| "Which stories qualify for single-shot mode (TE-27)?" | Pattern label (`hyperidle.story.pattern`) cross-referenced with cost |
| "Is Sonnet Builder regressing on quality?" | Re-plan count attribute over time |

Without this, every TE in the concept doc is a guess. With this, each TE is a measurable hypothesis with a before/after.

---

## Sources

- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OpenTelemetry GenAI agent spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
- [Claude Code OpenTelemetry observability](https://code.claude.com/docs/en/agent-sdk/observability)
- [SigNoz — Claude Code monitoring with OTel](https://signoz.io/blog/claude-code-monitoring-with-opentelemetry/)
- [ColeMurray claude-code-otel reference impl](https://github.com/ColeMurray/claude-code-otel)
- [Dynatrace AI coding agent monitoring (Claude Code, Gemini CLI, Codex CLI, OpenCode, Copilot SDK)](https://www.dynatrace.com/news/blog/dynatrace-expands-ai-coding-agent-monitoring/)
- [Ken Huang — Claude Code vs Hermes observability](https://kenhuangus.substack.com/p/chapter-9-observability-and-debugging)
- [Langfuse observability docs](https://langfuse.com/docs/observability/overview)
- [LangSmith vs Langfuse vs Arize vs Helicone (2026)](https://www.firecrawl.dev/blog/best-llm-observability-tools)
- [Logfire vs LangSmith vs Langfuse vs Arize pricing comparison](https://pydantic.dev/articles/ai-observability-pricing-comparison)
- [Best AI Agent Observability Tools 2026 (Augment Code)](https://www.augmentcode.com/tools/best-ai-agent-observability-tools)
- [Traceloop — track LLM token usage and cost per user](https://www.traceloop.com/blog/from-bills-to-budgets-how-to-track-llm-token-usage-and-cost-per-user)
- [DeepEval — step efficiency metric](https://deepeval.com/docs/metrics-step-efficiency)
- [ccusage CLI](https://github.com/ryoppippi/ccusage)
- [Brendan Gregg — flame graphs](https://www.brendangregg.com/FlameGraphs/cpuflamegraphs.html)
