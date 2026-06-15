# Concept — Kernel ↔ Strategy boundary + harness vocabulary (AK track)

**Status:** Locked (founder-aligned 2026-06-14). Fixed input for AK2 (the split) and AK3 (commit→work); reference for the rest of the AK track.
**Supersedes:** the scattered "kernel = stable / fabric = volatile" framing in `docs/` — explicitly rejected by the founder. Treat that framing as unreliable; this concept is the authority until mirrored to `docs/architecture/kernel-strategy-split.md`.

**Goal of this concept (narrow).** Adjust the **separation** between Kernel and Strategy so that (1) a **minimal strategy** plugs into a clean seam, and (2) the **Fabric** — whose knowledge-management design is deeply researched and **out of scope to change** — keeps working exactly as intended behind the shifted split. We are NOT redesigning how the Fabric does knowledge management; we are drawing the boundary it lives behind.

## Required reading (downstream: /architecture, /pipeline)
- This file.
- `plans/AK/kernel-strategy-usp-analysis.md` (founder-annotated) — the verified reality (commit is inert, server hard-imports fabric, etc.).
- `.pipeline/work-packages/TRACK-AK.md` — AK1–AK5 (dependency-ordered: AK1 rename → AK2 split → AK3 commit→work; AK4/AK5 need only AK1).
- Code ground truth (NOT the prose docs): `packages/fabric/src/services/*` (the full Strategy's actual behaviours), `packages/fabric/src/services/provision-registry.ts` (the seam), `packages/server/src/services/session-provisioning.ts` (the kernel→fabric coupling to break), `packages/db/src/schema.ts` (`knowledgeStrategyFabric`/`taskStrategyFabric`).

---

## 1. The boundary (replaces stable/volatile)

The cut is by **function**, not by stability ("the stable/not-stable stuff is bullshit" — founder).

- **Kernel = the application itself, including the agent-running runtime.** Conversations, work planning & review, knowledge **editing**, user management — and everything required to *run agents*: the harness (incl tools, Skills, hooks), the sandbox, the session, cost. The Kernel is what the user operates and what executes agents. A Kernel with a no-op Strategy is a complete, usable application.
- **Strategy = the knowledge/context layer.** It owns **what an agent knows** and **how knowledge compounds over time** — nothing else. It is the genuinely fast-moving part (agentic knowledge management changes monthly), which is why it must be swappable.

Test for "is X Kernel or Strategy?": *Is X about running the company / running agents (Kernel), or about what agents know and how that knowledge improves itself (Strategy)?*

Consequence: **knowledge *editing* is Kernel** (a person editing a doc is an app feature); **knowledge *management* is Strategy** (the automated organizing/scoring/propagation/improvement).

---

## 2. Strategy — the three responsibilities

Strategy is the full knowledge-management loop. Three responsibilities:

1. **Context assembly (in).** At session start, given a task/agent/context, decide what knowledge + memory to assemble into the agent's context window. (Industry: *context assembly* under *context engineering*. Today: `materialize` + `composePrompt`.)
2. **Learning ingestion (out).** After a session, capture/score what was produced or learned and write it back into the knowledge base.
3. **Autonomous knowledge work (background).** Routines and **Strategy-spawned agents** that run *across the whole knowledge base* to improve it over time — the "improvement" class the industry is circling (Claude's **dreaming**, Hermes' **automatic skill generation**). In HyperIdle this is realised by the **Fabric's 4-layer knowledge strategy** (materialization, promotion, attention scoring, practice consolidation, propagation, decay) — **deeply researched, out of scope to change here.** These run on the Kernel's agent-running runtime but are *directed by* the Strategy. The concept's only obligation toward responsibility #3 is that the boundary must let the Fabric keep doing all of it, unchanged.

The **Strategy Port** is the surface the Kernel exposes for (1) and (2); responsibility (3) is the Strategy operating autonomously (subscribing to events, scheduling routines, spawning its own agents) — the Kernel does not call it, it runs alongside.

**Minimal (reference) Strategy** = all three are inert: context assembly returns passthrough/empty (the agent runs on AGENTS.md + task only, no injected knowledge), ingestion is a no-op, and there are **no routines, no spawned agents, no improvement** — knowledge stays exactly as-is. This is the strategy that proves the Kernel works in isolation and the template a contributor copies.

**Fabric** = the current rich Strategy: the full set of `packages/fabric/src/services/*` behaviours (materialization, relevance/attention scoring, promotion pipeline, practice meetings, propagation, decay/retention, conflict resolution, notifications/routing, built-in routines). One implementation of the Strategy role — not *the* role.

---

## 3. Where the verified gaps land (resolving the AK questions)

- **AK3 (commit → work / decomposition):** **Kernel.** Running a PM agent to break a committed bet into tasks is work-planning + running an agent — both Kernel. Strategy only *feeds that PM agent its knowledge* via context assembly. Decomposition was "the wrong level" for a kernel/strategy question because it never was one. Under the Minimal Strategy the PM agent still decomposes — just without injected practice knowledge.
- **AK2 (swappable strategy + minimal reference):** the Strategy Port (responsibilities 1–2) plus the autonomous loop (3) is what gets defined; the Minimal Strategy implements the inert version; the Kernel stops hard-importing Fabric and instead talks to whichever Strategy is registered. Today `provision-registry.ts` is a half-seam (the dispatcher calls through it) but `session-provisioning.ts` (Kernel) still hard-imports `materialize`/`composePrompt`/`checkCostCap` from Fabric — a boundary violation to remove (cost is Kernel; context assembly is Strategy-via-port).

---

## 4. Vocabulary — locked (founder-approved)

Adopt current industry harness-engineering nouns; drop homegrown terms with no industry meaning.

| Concept | Canonical term | Aliases / homegrown to drop | Source of truth |
|---|---|---|---|
| Structure around the model | **harness** (and harness adapter) | — (already used) | winning umbrella term |
| Agent behaviour instruction | **system prompt** | ~~soul~~, ~~soul prompt~~ | universal; "soul" has zero industry use |
| Project/agent instruction file | **AGENTS.md** | — | Linux-Foundation cross-vendor standard |
| Isolated place an agent runs | **sandbox** (sandbox adapter); cwd `/workspace` | ~~workspace~~ (as the unit) | E2B/Modal/Vercel/Cloudflare/Anthropic consensus |
| One run of agent work | **session** | — (already used) | standard run unit |
| A capability the agent calls | **tool** (+ **MCP** for external) | part of ~~skill-tools~~ | universal |
| Packaged procedural know-how | **Skill** (Agent Skill) | part of ~~skill-tools~~ | Anthropic, now cross-vendor |
| Lifecycle interceptor | **hook** | — | Claude Code term, widely understood |
| Delegated isolated worker | **subagent** | — | standard |
| Assembling knowledge into context | **context assembly** (under **context engineering**) | ~~materialization~~, ~~prompt composition~~ | "materialization" has zero industry hits |
| The knowledge/context layer | **Strategy** | — | founder's term; kept |
| Current rich Strategy impl | **Fabric** | (was "the Strategy layer") | now one implementation, not the role |
| Agent memory | **short-term / long-term**, episodic/semantic/procedural | — | CoALA lineage, cross-framework |

> `skill-tools` splits into **Skills** + **tools** (+ **MCP**) — three distinct concepts the code currently conflates.

---

## 5. Per-noun concept locks

### Kernel
- **Definition.** The application and the runtime that runs agents — everything except the knowledge/context layer.
- **Essential properties.** Runs standalone with a no-op Strategy; owns the harness, sandbox, session, tools/Skills/hooks, cost, and all user-facing surfaces (conversations, work, knowledge *editing*, users).
- **Is not.** Not "the stable layer." Not the knowledge-management system. Not dependent on Fabric (current hard-import is a bug).
- **Authority.** Owns the primitive store, the event bus, the agent-running runtime.

### Strategy
- **Definition.** The pluggable knowledge/context layer: what an agent knows + how knowledge compounds.
- **Essential properties.** Implements context assembly (in) + learning ingestion (out) via the Strategy Port; may run autonomous routines and spawn its own knowledge-management agents on the Kernel runtime.
- **Is not.** Not the agent runtime (it *uses* the Kernel runtime to run its own agents). Not required for the app to function (Minimal is valid). Not "the fabric" — Fabric is one impl.
- **Authority.** Owns the knowledge layers/scopes and their management; reads kernel events, never owns kernel primitives.

### Strategy Port
- **Definition.** The Kernel-exposed contract a Strategy plugs into for context assembly (in) and learning ingestion (out).
- **Contracts.** Exactly one active Strategy at a time; the Kernel calls the port, never a concrete Strategy; the port must be satisfiable by a no-op (Minimal) implementation; cost enforcement stays Kernel-side, not in the port.

### Minimal (reference) Strategy
- **Definition.** The inert Strategy: passthrough/empty context, no ingestion, no routines, no spawned agents, no improvement.
- **Purpose.** Verify the Kernel in isolation (TDD harness) and serve as the contributor template. Not a recommended end-user experience.

### Fabric
- **Definition.** The current rich Strategy implementation (all of `packages/fabric/src/services/*`).
- **Reshape.** From "the Strategy layer" → "one implementation of the Strategy role." Behaviour must be unchanged when Fabric is the selected Strategy.

---

## 6. Rejection list (what this boundary is NOT)
- Strategy is **not** defined by stability/volatility — rejected criterion.
- Strategy is **not** the agent runtime — running agents (incl. Strategy's own knowledge agents) is Kernel.
- Decomposition is **not** a Strategy behaviour — it's a Kernel work feature fed by Strategy context.
- "Strategy" the layer is **not** "strategy agent" the agent *type* (team/strategy/individual) — same word, different axis; context disambiguates (noted; not renaming per founder Q4).

## 7. Out of scope
- **The Fabric's knowledge-management design** — the 4-layer knowledge strategy (materialization, promotion, attention, practice, propagation, decay) is deeply researched and settled. This concept does **not** question, reconcile, or redefine it. The only requirement on it is *preservation*: a Strategy port the Fabric cannot fully satisfy is a wrong port. Success = the Fabric works exactly as intended behind the shifted boundary.
- **Unified human-attention scoring** (who/what pulls the human in) — its own `/concept`; AK3's human-gate depends on it.
- **Full harness-vocabulary rename rollout** across code/docs/UI — this concept *locks the nouns*; the mechanical rename is implementation work registered as **AK1**, sequenced before the split (**AK2**) per founder Q2.

## 8. Rationale
The founder's USP is "nail the Kernel first." That only works if the Kernel is a complete application that runs agents *without* the knowledge magic, with the knowledge magic (the fast-moving, daily-changing part) as a swappable Strategy. The minimal Strategy is the proof and the contributor template. The boundary is functional (app+runtime vs knowledge/context), and the nouns must be industry-standard so the seams and the contributor story are legible to anyone in the 2025–2026 agent-infra space — homegrown terms like "soul" and "materialization" can't carry that.
