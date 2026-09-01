# The Five Layers

Knowledge in HyperIdle lives on a five-layer maturity ladder. The layers are live in code: `KNOWLEDGE_LAYERS` (`framework/domain-model/src/knowledge.ts:3-4`).

```
L4  FACTORY        monthly        humans write & read, agents propose
L3  PRACTICE       weekly         agents read/write, humans curate
L2  PRODUCT        per cycle      both — split by artifact type
L1  TASK           per task       agents own, humans sample
L0  SESSION        minutes        pure agent memory
```

The lower you go, the more agent-native. The higher you go, the more human-native. Knowledge flows up through promotion (L1 discoveries become L3 practices become L4 principles) and down through loading (factory rules shape what products do). The cadence words are design intent, not code-enforced schedules.

## Scope determines layer

Layer is assigned from an item's scope — `SCOPE_TO_LAYER` (`framework/domain-model/src/knowledge.ts:6-14`):

| Scope kind | Layer |
|---|---|
| `factory` | L4 |
| `practice` | L3 |
| `product` | L2 |
| `task` | L1 |
| `team`, `user` | none — outside the maturity flow |

Layer is a strategy signal: it lives on the `knowledge_app_projection` extension table, not on `knowledge_items` (O2 kernel/strategy split). Store semantics — scopes, statuses, the kernel/strategy table split — are owned by [the canonical store](the-canonical-store.md).

## L0: Session — the working set

An agent spinning up for a specific task. Minutes to hours.

- **Storage**: ephemeral. Rebuilt every session by context assembly, which writes `context/session.toon` into the sandbox (`layers/agent-orchestration/run-orchestration/src/context.ts`).
- **What loads**: all L4, product-scoped L2, and community-scoped L3 (`assembleSessionKnowledge`, `layers/core-api/knowledge/src/session-knowledge-assembler.ts:77-97`), filtered through relevance scoring and a token budget — see [relevance and attention](relevance-and-attention.md). Load what the task needs, nothing more.
- **Format**: TOON pack (`context/session.toon`) — see [the knowledge fabric](the-knowledge-fabric-how-knowledge-moves.md) for the projection model and sandbox layout.
- **Human touch**: none.

## L1: Task — the unit of work

A task is a tiny experiment with an expected outcome. When reality differs, that is the signal worth capturing.

- **Outcome capture**: on the task row itself — `tasks.outcomeVerdict` is a closed enum `met | met_with_rework | partially_met | not_met`, plus `notes` and `auditTrail` (`framework/db/src/schema.ts:202-236`).
- **Failures are first-class** — as knowledge items of kind `failure` (`framework/domain-model/src/knowledge.ts:41-49`), written back from the sandbox's `failures/` directory (`handleCreate`, `layers/agent-orchestration/run-orchestration/src/writeback-processor.ts:216-250`). There is no separate failures table.
- **How agents write**: the `write_memory` tool (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`) and sandbox writeback — there is no task-logging CLI.
- **Human touch**: sampling only, through the Work view. Humans never read raw task rows. Task and session mechanics live in [tasks and sessions](../process-layer/tasks-and-sessions.md).

## L2: Product — the department

A product runs for months. Its knowledge splits by artifact type.

**The human-readable part** — the product's core identity: `BRIEF`, `ARCHITECTURE`, `BRAND`, `PRINCIPLES`. These are knowledge items; there is no git export today — the database is the only store. The sketched (not-implemented) export shape is described in [facilitators](facilitators.md).

**The agent-native part** — process state. Tasks (recursive, any depth) are their own primitive table, never `knowledge_items` rows (see [the canonical store](the-canonical-store.md)). Decisions are knowledge items of kind `decision` — lightweight rows, not two-page ADRs.

**Capture happens inline with the work**: when an agent learns something during a session, it lands via writeback, not a separate documentation pass — see [sync and conflict resolution](sync-and-conflict-resolution.md).

## L3: Practice — cross-product learning

**The highest-leverage layer.** Most agent systems skip this entirely. The core behavior: before solving a problem from scratch, check whether someone already solved it — *reuse before create*.

- **Storage**: knowledge items at `practice` scope, one community per discipline: `building`, `product`, `growth`, `ops` (`framework/domain-model/src/agent-roles.ts`, `communityForRole` with fallback `ops`). All builders across all products share the `building` community — knowledge that emerges in one product is available to every other immediately.
- **Grouping**: `topic` is a first-class column (`framework/db/src/schema.ts:894`); tags and evidence live in the app projection extension's `meta` JSON (`framework/db/src/schema.ts:1020`).
- **Anti-patterns are first-class**: `anti_pattern` is its own knowledge kind (`framework/domain-model/src/knowledge.ts:41-49`), searchable alongside patterns. Promotion itself is generic, not kind-specific: the same `(layer, topic, kind)` signature repeated across 5+ distinct scopes auto-promotes an item's status regardless of kind (`layers/core-api/knowledge/src/promotion-pipeline.ts`).
- **Human touch**: curation through the [Knowledge view](../information-architecture/knowledge-view.md). Sharpen wording, retire stale items, add the tacit knowledge agents can't generate — customer taste, market intuition. Two unattended routines run alongside it: `knowledge-promotion` (weekly, Sunday 04:00, promotes provisional items past the repetition threshold) and `knowledge-decay` (weekly, Sunday 03:00, retires stale items) — both provided by the knowledge-management plugin. There is no meeting and no synchronous ritual.

## L4: Factory — the meta

The company's own brain. What we believe, what we're aiming at, which products get energy now.

- **Storage**: knowledge items at `factory` scope — kinds include `principle`, `focus`, `reflection` (`framework/domain-model/src/knowledge.ts:41-49`). There is no git export today — the database is the only store (see [facilitators](facilitators.md) for the sketched, not-implemented export shape).
- **Human touch**: humans write and read; agents propose changes for human approval. If an L4 item is hard to read, the architecture is wrong.

## How knowledge moves

- **Up — promotion**: the same finding with the same `(layer, topic, kind)` signature across 5+ distinct scopes auto-promotes to `validated` (`AUTO_PROMOTION_REPETITION_THRESHOLD`, `layers/core-api/knowledge/src/promotion-pipeline.ts:27`); active items unused for 90 days become stale candidates (`STALE_THRESHOLD_MS`, `promotion-pipeline.ts:34`). The full lifecycle is owned by [facilitators](facilitators.md).
- **Down — loading**: context assembly pulls L4 + L2 + L3 into every L0 session pack (above).
- **Write flow**: watcher, writeback, and conflict handling are owned by [sync and conflict resolution](sync-and-conflict-resolution.md).

## Provenance

The ideas this taxonomy borrowed (sole home of these credits):

- **Letta/MemGPT** — memory tiered like an OS; the agent manages its own working set (L0-L4 tiering).
- **Google's Always-On Memory Agent** — a structured store beats a vector DB for agent state; that instinct now lives in PGlite/Postgres.
- **TOON format** — ~40% fewer tokens than JSON for structured context packs (L0 loading).
- **KCS (Knowledge-Centered Service)** — reuse before create, the single highest-leverage knowledge behavior (L3).
- **Shape Up** — time-boxed tasks over backlog as the work model the knowledge layers feed.
