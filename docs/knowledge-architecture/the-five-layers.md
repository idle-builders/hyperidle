# The Five Layers

Knowledge in HyperIdle lives on a five-layer maturity ladder. The layers are live in code: `KNOWLEDGE_LAYERS` (`packages/fabric/src/types.ts:13-14`).

```
L4  FACTORY        monthly        humans write & read, agents propose
L3  PRACTICE       weekly         agents read/write, humans curate
L2  PRODUCT        per cycle      both — split by artifact type
L1  TASK           per task       agents own, humans sample
L0  SESSION        minutes        pure agent memory
```

The lower you go, the more agent-native. The higher you go, the more human-native. Knowledge flows up through promotion (L1 discoveries become L3 practices become L4 principles) and down through loading (factory rules shape what products do). The cadence words are design intent, not code-enforced schedules.

## Scope determines layer

Layer is assigned by the fabric from an item's scope — `SCOPE_TO_LAYER` (`packages/fabric/src/types.ts:25-33`):

| Scope kind | Layer |
|---|---|
| `factory` | L4 |
| `practice` | L3 |
| `product` | L2 |
| `task` | L1 |
| `bet`, `team`, `user` | none — outside the maturity flow |

Layer is a strategy signal: it lives on the `knowledge_strategy_fabric` extension table, not on `knowledge_items` (O2 kernel/strategy split). Store semantics — scopes, statuses, the kernel/strategy table split — are owned by [the canonical store](the-canonical-store.md).

## L0: Session — the working set

An agent spinning up for a specific task. Minutes to hours.

- **Storage**: ephemeral. Rebuilt every session by context assembly, which writes `context/session.toon` into the sandbox (`packages/fabric/src/context-assembly.ts:275-283`).
- **What loads**: all L4, product-scoped L2, and community-scoped L3 (`context-assembly.ts:216-219`), filtered through relevance scoring and a token budget — see [relevance and attention](relevance-and-attention.md). Load what the task needs, nothing more.
- **Format**: TOON pack (`context/session.toon`) — see [the knowledge fabric](the-knowledge-fabric-how-knowledge-moves.md) for the projection model and sandbox layout.
- **Human touch**: none.

## L1: Task — the unit of work

A task is a tiny experiment with an expected outcome. When reality differs, that is the signal worth capturing.

- **Outcome capture**: on the task row itself — `tasks.outcomeVerdict` is a closed enum `met | met_with_rework | partially_met | not_met`, plus `notes` and `auditTrail` (`packages/db/src/schema.ts:204-243`).
- **Failures are first-class** — as knowledge items of kind `failure` (`packages/fabric/src/types.ts:74-82`), written back from the sandbox's `failures/` directory (`packages/fabric/src/writeback.ts:163-167`). There is no separate failures table.
- **How agents write**: server tools (`packages/server/src/tools/write-memory.ts`) and sandbox writeback — there is no task-logging CLI.
- **Human touch**: sampling only, through the Work view. Humans never read raw task rows. Task and session mechanics live in [tasks and sessions](../process-layer/tasks-and-sessions.md).

## L2: Product — the department

A product runs for months. Its knowledge splits by artifact type.

**The human-readable part** — the product's core identity: `BRIEF`, `ARCHITECTURE`, `BRAND`, `PRINCIPLES`. These are knowledge items whose active/validated versions are exported to git as `products/<scopeId>/<KIND>.md`. The database is canonical; the markdown files are projections. Export structure and lifecycle are owned by [facilitators](facilitators.md).

**The agent-native part** — process state. Tasks and bets are their own primitive tables, never `knowledge_items` rows (see [the canonical store](the-canonical-store.md)). Decisions are knowledge items of kind `decision` — lightweight rows, not two-page ADRs.

**Capture happens inline with the work**: when an agent learns something during a session, it lands via writeback, not a separate documentation pass — see [sync and conflict resolution](sync-and-conflict-resolution.md).

## L3: Practice — cross-product learning

**The highest-leverage layer.** Most agent systems skip this entirely. The core behavior: before solving a problem from scratch, check whether someone already solved it — *reuse before create*.

- **Storage**: knowledge items at `practice` scope, one community per discipline: `building`, `product`, `growth`, `ops` (`packages/shared/src/agent-roles.ts`, `communityForRole` with fallback `ops`). All builders across all products share the `building` community — knowledge that emerges in one product is available to every other immediately.
- **Grouping**: `topic` is a first-class column (`packages/db/src/schema.ts:591`); tags and evidence live in the fabric extension's `meta` JSON (`schema.ts:706`).
- **Anti-patterns are first-class**: `anti_pattern` is its own knowledge kind, searchable alongside patterns. The promotion pipeline has a dedicated path: a `failure` item that accumulates repetition cross-scope can be promoted directly to `anti_pattern` kind (`packages/fabric/src/promotion-pipeline.ts`).
- **Human touch**: weekly curation through the [Knowledge view](../information-architecture/knowledge-view.md) and the builtin `practice-meeting` routine (`packages/fabric/src/services/builtin-routines.ts`). Sharpen wording, retire stale items, add the tacit knowledge agents can't generate — customer taste, market intuition.

## L4: Factory — the meta

The company's own brain. What we believe, what we're aiming at, which products get energy now.

- **Storage**: knowledge items at `factory` scope — kinds include `principle`, `focus`, `reflection` (`packages/fabric/src/types.ts:74-82`). Exported to git as `factory/PRINCIPLES.md`, `factory/FOCUS.md`, `factory/PORTFOLIO.md`, and `factory/REFLECTIONS/<topic>.md` — again projections; the database is canonical, git is the history (see [facilitators](facilitators.md)).
- **Human touch**: humans write and read; agents propose changes for human approval. If an L4 item is hard to read, the architecture is wrong.

## How knowledge moves

- **Up — promotion**: the same finding with the same `(layer, topic, kind)` signature across 5+ distinct scopes auto-promotes to `validated` (`AUTO_PROMOTION_REPETITION_THRESHOLD`, `packages/fabric/src/promotion-pipeline.ts:27`); active items unused for 90 days become stale candidates (`promotion-pipeline.ts:34`). The full lifecycle is owned by [facilitators](facilitators.md).
- **Down — loading**: context assembly pulls L4 + L2 + L3 into every L0 session pack (above).
- **Write flow**: watcher, writeback, and conflict handling are owned by [sync and conflict resolution](sync-and-conflict-resolution.md).

## Provenance

The ideas this taxonomy borrowed (sole home of these credits):

- **Letta/MemGPT** — memory tiered like an OS; the agent manages its own working set (L0-L4 tiering).
- **Google's Always-On Memory Agent** — a structured store beats a vector DB for agent state; that instinct now lives in PGlite/Postgres.
- **TOON format** — ~40% fewer tokens than JSON for structured context packs (L0 loading).
- **KCS (Knowledge-Centered Service)** — reuse before create, the single highest-leverage knowledge behavior (L3).
- **Shape Up** — bets over backlog as the work model the knowledge layers feed.
