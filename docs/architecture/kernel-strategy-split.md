# Kernel ↔ Strategy split

**Status:** Authoritative (founder-aligned 2026-06-14). This document is the ground truth for the kernel/strategy boundary and the harness-engineering vocabulary. It **supersedes** the older "kernel = stable / fabric = volatile" framing scattered in other docs (e.g. `technology-summary.md`'s package table) — that framing is rejected. Where another doc disagrees with this one on the boundary or the nouns, this one wins.

Originating research: `plans/AK/kernel-strategy-usp-analysis.md`, `plans/AK/concept.md` (both tracked under `plans/AK/`). Build track: `.pipeline/work-packages/TRACK-AK.md`.

---

## 1. The boundary (functional, not stability)

The cut is by **function**, not by how often a part changes (the stable/volatile criterion is rejected).

- **Kernel = the application itself, including the agent-running runtime.** Conversations, work planning & review, knowledge **editing**, user management — and everything required to *run agents*: the **harness** (incl. tools, Skills, hooks), the **sandbox**, the **session**, **cost**. The Kernel is what the user operates and what executes agents. A Kernel with a no-op Strategy is a complete, usable application.
- **Strategy = the knowledge/context layer.** It owns **what an agent knows** and **how knowledge compounds over time** — nothing else. This is the genuinely fast-moving part of the agentic space (it changes monthly), which is why it is swappable.

**Test** for "is X Kernel or Strategy?": *Is X about running the company / running agents (Kernel), or about what agents know and how that knowledge improves itself (Strategy)?*

Consequence: **knowledge *editing* is Kernel** (a person editing a doc is an app feature); **knowledge *management* is Strategy** (the automated organizing / scoring / propagation / improvement).

---

## 2. Strategy — three responsibilities and the port

Strategy is the full knowledge-management loop:

1. **Context assembly (in).** At session start, decide what knowledge + memory to assemble into the agent's context window. (Industry: *context assembly* under *context engineering*. Today: `assemble context` + `assemblePrompt`.)
2. **Learning ingestion (out).** After a session, capture/score what was produced and write it back into the knowledge base.
3. **Autonomous knowledge work (background).** Routines and Strategy-spawned agents that run *across the whole knowledge base* to improve it over time — the "improvement" class the industry is circling (Claude's *dreaming*, Hermes' *automatic skill generation*). In HyperIdle this is realised by the **Fabric's deeply-researched knowledge-management design (out of scope to change).** These run on the Kernel's agent-running runtime but are *directed by* the Strategy.

The **Strategy Port** is the surface the Kernel exposes for (1) and (2); responsibility (3) is the Strategy operating autonomously (subscribing to events, scheduling routines, spawning its own agents) — the Kernel does not call it; it runs alongside.

- **Minimal (reference) Strategy** = all three inert: context assembly returns passthrough/empty (the agent runs on its AGENTS.md + task only), ingestion is a no-op, no routines, no spawned agents, no improvement. It proves the Kernel works in isolation and is the template a contributor copies. Not a recommended end-user experience.
- **Fabric** = the current rich Strategy (all of `packages/fabric/src/services/*`). **One** implementation of the Strategy role — not *the* role. Its knowledge-management design is settled; the only requirement on it through this split is **preservation**: it must keep working exactly as intended behind the boundary. *A Strategy Port the Fabric cannot fully satisfy is the wrong port.*

**Hard rules:** exactly one active Strategy at a time; the Kernel calls the port, never a concrete Strategy; the port must be satisfiable by a no-op (Minimal) implementation; **cost enforcement stays Kernel-side**, not in the port.

---

## 3. Current state and the gap

`provision-registry.ts` (`setProvisionSessionFn`/`getProvisionSessionFn`) is a genuine seam the dispatcher calls through. But the production `provisionSession` (`packages/server/src/services/session-provisioning.ts`, Kernel) **hard-imports** the Fabric (`assemble context`, `assemblePrompt`, `checkCostCap`) — violating the stated "the kernel never imports from fabric" rule. O2 already moved Strategy *fields* into extension tables (`knowledgeStrategyFabric`, `taskStrategyFabric`); the *package/runtime* split is not yet real. Closing this (defining the port, building the Minimal Strategy, removing the hard import while the Fabric runs unchanged) is **TRACK-AK / AK2**.

Decomposition (a committed bet → tasks, **AK3**) is **Kernel** — work-planning plus running a PM agent; the Strategy only feeds that PM agent context via the port. It was never a kernel-vs-strategy question.

---

## 4. Vocabulary (locked, industry-aligned)

Adopt current agent-harness nouns; drop homegrown terms. The rollout is **TRACK-AK / AK1**, sequenced before the split.

| Concept | Canonical term | Drop |
|---|---|---|
| Structure around the model | **harness** (harness adapter) | — |
| Agent behaviour instruction | **system prompt** | ~~old term~~ (zero industry use) |
| Project/agent instruction file | **AGENTS.md** (Linux-Foundation cross-vendor standard) | — |
| Isolated place an agent runs | **sandbox** (sandbox adapter), cwd `/workspace` | ~~workspace~~ as the unit |
| One run of agent work | **session** | — |
| Capability the agent calls | **tool** (+ **MCP** for external) | part of ~~tools~~ |
| Packaged procedural know-how | **Skill** (Agent Skill) | part of ~~tools~~ |
| Lifecycle interceptor | **hook** | — |
| Delegated isolated worker | **subagent** | — |
| Assembling knowledge into context | **context assembly** (under **context engineering**) | ~~context assembly~~, ~~context assembly~~ |
| The knowledge/context layer | **Strategy** (kept); current impl = **Fabric** (one impl) | — |
| Agent memory | **short-term / long-term**, episodic/semantic/procedural | — |

`tools` splits into **Skills** + **tools** (+ **MCP**) — three distinct concepts.

Note: "Strategy" the *layer* is distinct from "strategy agent" the *agent type* (team/strategy/individual) — same word, different axis; context disambiguates.

---

## 5. Rationale

The founder's USP is "nail the Kernel first." That only works if the Kernel is a complete application that runs agents *without* the knowledge magic, with the knowledge magic (the fast-moving part) as a swappable Strategy. The Minimal Strategy is the proof and the contributor template; the Fabric is the rich default, preserved unchanged behind the boundary. The nouns must be industry-standard so the seam and the contributor story are legible to anyone in the 2025–2026 agent-infra space — homegrown terms can't carry that.

## 6. Out of scope here
- The Fabric's internal knowledge-management design (deeply researched; preserved, not redefined).
- **Unified human-attention scoring** (who/what pulls the human in) — a separate concept; AK3's human-gate depends on it.
