# Research — one capability, two surfaces (human UI + agent tools)

Web research, 2026-09-10. Tiered by evidence quality. Topic is heavily SEO-farmed;
everything below is marked for what kind of claim it is.

## 1. Is "agent-native / agent-first" a real pattern?

**Real vocabulary, one credible practitioner account, no evidence for the specific ordering.**

**Practice (strongest source):** PostHog, *The golden rules of agent-first product
engineering*, Jina Yoon, **2026-04-08**. First-party retrospective from a team that rebuilt
its agent architecture twice over an existing UI product. Five rules, verbatim: "Let agents
do everything users can" · "Meet agents at their level of abstraction" · "Front-load
universal context" · "Writing skills is a human skill" · "Treat agents like real users".

- Their v1 mistake: "every endpoint into an MCP tool", with a four-line system prompt that
  "essentially said 'Here are some tools for using PostHog, GLHF.'"
- v2: generated from typed endpoints → OpenAPI → Zod → TS handlers, with **manual opt-in
  YAML per product team; nothing exposed by default**.
- They treat a missing capability as a *bug*: without `experiment-create` the agent
  "create[s] the flag and insight, but must stop and ask you".
- **They deleted all read/get endpoints** from the surface — subsumed by one SQL query tool.
  Meeting agents at their level meant *removing* surface, not mirroring it.
- No metrics. Credible practice reporting, not measurement.

**Opinion, coherent:** Builder.io, *Agent-Native: The Next Architecture for Software*,
**2026-05-08** — "Shared Action Model": *"Define the action once... From that single
definition, the UI can call it, the agent can see it as a tool."* Plus "Agent UI Parity".
**It argues co-equal surfaces, explicitly NOT agent-first.** Potocki, *Agent-First:
Designing for MCP and CLI as the Primary Surface*, **2026-04-29**, does argue the ordering —
pure essay, no implementation, no data.

**Discount:** `mcp-first.ai` (no author, no org, unverifiable) · `agentnative.dev/patterns`
(all agent *runtime* concerns — loop termination, checkpointing — nothing on dual surfaces) ·
1ClickReport post-mortem, **2026-05-21** (3x conversion claims with no methodology, sells
the author's MCP products).

## 2. How MCP servers over an existing product pick their surface

**Best-evidenced area.**

*From REST to MCP: An Empirical Study of API Wrapping*, arXiv, submitted **2025-07-21**,
v4 **2026-04-06**. 116 official MCP servers, 80 OpenAPI contracts:
- 88.6% fully or partially REST-backed
- **92% implement tools as bare API wrappers**
- servers expose a **median 19%** of available operations
- filtering and regrouping cut median tool count by a third

Anthropic, *Writing effective tools for agents*, **2025-09-11** (pre-window but the origin
text everyone restates): *"A common error we've observed is tools that merely wrap existing
software functionality or API endpoints."* Consolidation example: `list_users` +
`list_events` + `create_event` → one `schedule_event`.

WorkOS, *Designing an MCP server from a REST API*, **2026-04-30** — *"MCP is a user
interface, and your user is an AI agent."* Heuristics: **five-tool test** (a typical goal
needing ≥5 calls means you fragmented), 4–5 parameters ideal, N-to-1 consolidation is the
highest-value move, read-only data as **resources not tools**, *"Every tool you don't expose
is a tool the model can't misuse."* Worked example: 24 endpoints → 8 tools + 3 resources
+ 2 prompts.

**The live tension:** the paper says 92% of shipped servers *are* thin wrappers; all the
guidance says don't be. PostHog resolved it a third way neither anticipates — expose SQL,
delete the reads.

## 3. One capability registry projected into several surfaces

**Thinnest area. Searches mostly return MCP *registries* — server discovery catalogues —
which is a different thing.**

- PostHog's codegen is the only real implementation found, and it flows API→tool, not
  registry→both.
- Builder.io's "Shared Action Model" is the clearest articulation, with no implementation.
- **MCP Apps (SEP-1865)** — created **2025-11-21**, **Final 2026-01-26**. The one *shipping
  standard* where the ordering is genuinely tool-first: UI is declared as predeclared `ui://`
  resources and **tools reference UI resources via `_meta`** — the tool is the primary
  artefact and the interface hangs off it. The UI iframe talks back over the same MCP
  JSON-RPC, so **the UI's actions are the agent's tool calls**. Hosts may require explicit
  approval for UI-initiated calls. Adopters cited: Postman, HuggingFace, Shopify, Goose,
  ElevenLabs. Narrow — UI rendered *inside* an agent host, not a standalone product UI.
- **WebMCP** (`navigator.modelContext`) — the inverse: a page declares its own UI actions as
  tools. W3C Web ML CG, Google + Microsoft, Chrome 146 Canary **2026-02-10**. Still draft.

## 4. Agent identity — this argues against the users-table premise

**Three independent sources say agents should be first-class principals, not user rows.**

- Auth0, *AI Agents Are Not Users*, **2026-06-17**. Failure modes: over-permissioning
  (scopes defined at resource level); no fixed code path, so a system "cannot distinguish
  between 'the agent is summarizing tickets' and 'the agent is issuing refunds' because both
  present the same broadly-scoped credential"; system prompts are "advisory, not enforced".
  Proposes a dedicated directory identifier, **request-scoped permissions evaluated at
  runtime**, explicit delegation context, independent audit trail. Built on RFC 8693.
- Auth0, *Agent as Principal*, **2026-07-30**. Agents operate in **multiple modes at once** —
  on-behalf-of a user one moment, autonomous the next — with stable identity across several
  underlying credentials. One users row cannot express that.
- Microsoft Security, *Least privilege for AI agents*, **2026-07-16**. *"Treat every agent as
  a first-class principal."* Argues for **task-based narrow roles rather than extending human
  RBAC**, plus "tool binding" as a separate layer above permissions.

**What a users row reportedly cannot hold:** an owner, an independent kill switch, dual
on-behalf-of/autonomous modes, request-scoped runtime-evaluated permissions, the delegation
chain.

**The counter:** no source argues against a shared authorization *decision point*. The
disagreement is about the principal record and scope granularity, not about having one policy
engine. Auth0's own model keeps the human as delegating subject.

**Protocol gap:** *Governance Gaps in Agent Interoperability Protocols*, arXiv, **July 2026**
— MCP, A2A and ACP cannot express delegated authority constraints, scoped permissions across
nested agent hierarchies, or context-dependent authorization. Identical scoping across both
surfaces has to be enforced below the protocol.

## 5. Is CRUD a poor fit for agents?

**Two 2026 papers, reacting to the same failure, proposing opposite fixes.**

*Agent-First Tool APIs*, Pan & Hou (A2A Lab), v2 **2026-08-20**. Five mismatches, including
**permission conflation**: "traditional access control binds to users, but autonomous agents
need tool-level capability checks". Proposes six verbs — `semantic_search`,
`resolve_candidates`, `preview_action`, `execute_action`, `verify_result`,
`recover_from_error` — plus confidence/provenance/next-action metadata on every result.

Results (50 tasks, MiniMax-M2.7): success **64.0% → 88.0%** · ID hallucinations **14 → 2** ·
error recovery **12.5% → 72.7%** · human intervention **22% → 6%** · calls/task **4.8 → 3.2**.
Costs: latency **+48.4%**, tokens **+36.9%**. Single model, 50 tasks, authors' own baseline,
validated on their own SaaS. Suggestive, not settled.

*We fixed the engine and threw away the map*, Petychakis, **2026-09-07** (three days old).
Argues MCP treats tools as a *search* problem rather than a *traversal* problem, and that the
protocol "explicitly forbids servers from indicating which actions are currently valid,
inverting REST principles". Cites 58 tools ≈ 55,000 tokens pre-conversation; tool-selection
accuracy 13.62% full-catalogue vs 43.13% with retrieval; Opus 4 49% with all tools vs 74%
filtered-and-presented-as-code. Proposes returning only **currently valid affordances** with
preconditions, effects and state.

**Note for this project:** "only expose currently valid affordances" is exactly what a UI does
when it greys out a button — which suggests the UI's affordance logic and the agent's tool
list want to be *the same computation*.

**Third position.** Anthropic, *Code execution with MCP*, **2025-11-04** (via secondary
sources): internal tool definitions had reached 134K tokens; presenting servers as a
filesystem-like API explored via code took one case from ~150,000 to ~2,000 tokens (98.7%).
Implication: **"every capability is a discrete registered tool" may be the wrong projection**
— the agent surface may want to be a typed SDK over the capability layer, not a flat list.

## 6. Skeptical positions

1. **Timing.** Meyer, *WebMCP Reality Check*, **2026-05-13**: as of May 2026 no mainstream
   agent calls `navigator.modelContext` on websites; they still DOM-scrape. Estimates
   "12–18 months early". About WebMCP specifically, not server-side MCP.
2. **CLI-is-enough.** A documented REST endpoint plus a markdown file may beat a custom MCP
   server for agents with shell access. Attributed partly to a Karpathy post, **Feb 2026**.
   Reported via snippets, not verified.
3. **Scope-dependence.** Several vendors concede MCP is overhead below multi-agent /
   multi-team / governance scale.
4. **Curation kills capability.** If the tool layer exposes a handful of parameters while the
   API accepts dozens, agents fail on workflows needing an unexposed field. Directly opposes
   WorkOS's "every tool you don't expose is a tool the model can't misuse" — an unresolved
   tension that lands on any parity requirement.

**No credible named engineer was found arguing "agent-native architecture is unnecessary,
just design good APIs."** Skepticism is all narrower.

## What could not be found

- **Any post-mortem from a team that designed the agent surface first and then built a UI on
  it.** Every real account went UI/API-first and retrofitted. The ordering is untested in public.
- **Any engineering account of humans and agents as rows in the same users table.** Searched
  directly. The identity literature argues against it; nobody writes up having done it.
- A real capability-registry→N-surfaces implementation beyond PostHog's codegen.
- Anything from Stripe, Linear or Shopify engineering on reconciling MCP with their API.
- Any recent source arguing about hexagonal/CQRS/BFF surviving contact with agents. The
  layered capability/adapter stack two sources describe is hexagonal in all but name, but
  **neither cites it**, so the claim is not theirs to borrow.
- Anything on rate-limiting, quota or billing differences between human and agent principals.

## Strongest sources

| Source | Date | Why |
|---|---|---|
| PostHog, *Golden rules of agent-first product engineering* | 2026-04-08 | only real practitioner account of UI/agent parity |
| arXiv, *From REST to MCP: empirical study* | v4 2026-04-06 | hard numbers on real MCP surfaces |
| Anthropic, *Writing effective tools for agents* | 2025-09-11 | the origin text |
| MCP SEP-1865, *MCP Apps* | Final 2026-01-26 | the only shipping standard where UI projects from the tool |
| Auth0, *AI Agents Are Not Users* | 2026-06-17 | the argued rebuttal to the users-table premise |
| Microsoft, *Least privilege for AI agents* | 2026-07-16 | argues the agent permission model should differ |
| Pan & Hou, *Agent-First Tool APIs* | v2 2026-08-20 | the only quantified anti-CRUD case, costs stated |
| Petychakis, *We fixed the engine…* | 2026-09-07 | best-argued opposing diagnosis: affordances, not search |
| WorkOS, *Designing an MCP server from a REST API* | 2026-04-30 | most actionable heuristics |

## The two load-bearing claims with the least support

1. **That designing the agent surface first produces a better UI** — opinion only, zero evidence.
2. **That identical permission scoping across humans and agents is workable** — three
   independent sources argue the opposite.
