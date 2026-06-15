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

## 3. As-built — AK2 (shipped 2026-06-15)

The seam described in §2 is now real in code. Pre-AK2, `session-provisioning.ts` and `session-lifecycle.ts` hard-imported `assembleContext` and `startWatcher` directly from `@hyperidle/fabric`. AK2 closed that gap.

### The Strategy Port contract

Defined in `packages/shared/src/strategy-port.ts` (exported from `@hyperidle/shared`). Two methods:

```ts
interface Strategy<TDb> {
  assembleContext(req: ContextAssemblyRequest<TDb>): Promise<ContextAssemblyOutcome>;
  beginLearningIngestion(req: IngestionRequest<TDb>): IngestionHandle;
}
```

`TDb` is a type parameter, not a concrete import — `@hyperidle/shared` stays db-agnostic (importing `HyperIdleDb` into shared would invert the `db → shared` dependency direction). The Kernel binds `TDb = HyperIdleDb` at the registry boundary.

**`assembleContext`** — called at P6 (session admission). The Strategy populates the sandbox's `context/`, `knowledge/`, `work/` directories and writes `.fabric/manifest.json`. The Kernel does not read assembled content — the agent reads it from disk.

**`beginLearningIngestion`** — called at P7 (immediately after context assembly). Returns an `IngestionHandle`. The Kernel disposes the handle on every teardown path (complete / crash / budget_exhausted). `dispose()` must not throw — best-effort flush.

**Responsibility 3 (background knowledge work) is NOT in the port.** The Strategy operates this autonomously via `bootstrapFabric` at boot. The Kernel does not call it.

**Cost enforcement stays Kernel-side.** `checkCostCap`, `recordCostAndCheck`, `scaleForCurrency` are direct Kernel imports and never cross the port.

### Strategy registry

`packages/server/src/services/strategy-registry.ts` — a lean module-scope variable, same idiom as `provision-registry.ts`. Three exports: `setActiveStrategy`, `getActiveStrategy`, `clearActiveStrategy` (test teardown only).

`getActiveStrategy()` throws immediately if no Strategy is registered — a missing registration is a boot bug, not a recoverable state. Boot always calls `setActiveStrategy` exactly once.

### Boot wiring (composition root)

`packages/server/src/server-factory.ts` registers the Fabric as the default:

```ts
setActiveStrategy(fabricStrategy);  // default; swap this line to select a different Strategy
```

This is the only place in Kernel code that may import a concrete Strategy. The ESLint guard (below) enforces this.

### Fabric adapter (no behaviour change)

`packages/fabric/src/fabric-strategy.ts` — a thin adapter that delegates to the existing `assembleContext` and `startWatcher` functions unchanged. The only translation: `req.teamId → productId` in the Fabric's config (a field-rename from the AK1 vocabulary rollout). The underlying Fabric functions and all Fabric-internal tests are untouched.

### Minimal reference Strategy

`packages/strategy-minimal` — a real workspace package (`@hyperidle/strategy-minimal`) that ships with a documented README and serves as the contributor template.

`assembleContext`: creates empty `context/`, `knowledge/`, `work/`, `.fabric/` scaffold dirs + writes an empty-items `manifest.json`. Returns `{ itemCount: 0, durationMs: 0 }`. No knowledge injection.

`beginLearningIngestion`: returns a no-op `IngestionHandle`. `dispose()` does nothing and never throws.

Background responsibility: absent. No bootstrap, no routines, no spawned agents.

The scaffold and empty manifest are written even though no context is assembled — the harness and crash post-mortems require them to exist.

### ESLint static guard (AC4)

`eslint.config.ts` scopes a `no-restricted-imports` rule to `packages/server/src/**`, excluding the composition root (`server-factory.ts`) and test files. The guard bans:

- All of `@hyperidle/strategy-minimal` (full package ban from Kernel source)
- `assembleContext`, `startWatcher`, `FileWatcher`, `FileWatcherConfig` from `@hyperidle/fabric`

This enforces "the Kernel imports no concrete Strategy" statically. Both `session-provisioning.ts` and `session-lifecycle.ts` (the two independent provisioning paths) are clean against this guard.

### What AK2 does NOT move (deferred to AK2b)

Cost enforcement, context-assembly, and session-context DB reads (`cost-cap.ts`, `context-assembly-prompt.ts`, `session-context.ts`) are conceptually Kernel but **physically still live in `packages/fabric`**. The Kernel imports them directly — this is not banned by the AK2 guard (those symbols are not behind the port). Moving them out of `packages/fabric` into `packages/server` or a new `packages/kernel` is the scope of a follow-up workpackage (AK2b / kernel package extraction). The runtime seam is real; physical packaging is pending.

---

## 4. Prior gap (closed by AK2)

Pre-AK2: `provision-registry.ts` (`setProvisionSessionFn`/`getProvisionSessionFn`) was a genuine seam the dispatcher called through, but the production `provisionSession` hard-imported the Fabric (`assembleContext`, `startWatcher`, `checkCostCap`) — violating the boundary. O2 had moved Strategy *fields* into extension tables (`knowledgeStrategyFabric`, `taskStrategyFabric`); the *package/runtime* split was not yet real. AK2 closed this gap.

Decomposition (a committed bet → tasks, **AK3**) is **Kernel** — work-planning plus running a PM agent; the Strategy only feeds that PM agent context via the port. It was never a kernel-vs-strategy question.

---

## 5. Vocabulary (locked, industry-aligned)

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

## 6. Rationale

The founder's USP is "nail the Kernel first." That only works if the Kernel is a complete application that runs agents *without* the knowledge magic, with the knowledge magic (the fast-moving part) as a swappable Strategy. The Minimal Strategy is the proof and the contributor template; the Fabric is the rich default, preserved unchanged behind the boundary. The nouns must be industry-standard so the seam and the contributor story are legible to anyone in the 2025–2026 agent-infra space — homegrown terms can't carry that.

## 7. Out of scope here
- The Fabric's internal knowledge-management design (deeply researched; preserved, not redefined).
- **Unified human-attention scoring** (who/what pulls the human in) — a separate concept; AK3's human-gate depends on it.
