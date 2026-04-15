# Work Packages — HyperIdle Implementation

Agent-friendly user stories organized in eight parallel tracks with outcome-level acceptance criteria.

**Track files:** [Track A](TRACK-A.md) | [Track B](TRACK-B.md) | [Track C](TRACK-C.md) | [Track D](TRACK-D.md) | [Track E](TRACK-E.md) | [Track F](TRACK-F.md) | [Track G](TRACK-G.md) | [Track H](TRACK-H.md)

---

## Tech Stack Decision

**Backend:** TypeScript on Bun, Hono (HTTP/WebSocket), Drizzle ORM (SQLite + PostgreSQL), BullMQ (production scheduling).
**Frontend:** React + Vite + TypeScript, Tailwind CSS + DaisyUI + `factory-dark` theme.
**Database:** Drizzle dual-driver schema (better-sqlite3 default, postgres.js for scale).
**Monorepo:** Five packages: `db`, `server`, `web`, `fabric`, `shared`.

---

## Shared Contracts (consolidated)

**KnowledgeMetadata schema signature:**
```
{
  layer: 'L0' | 'L1' | 'L2' | 'L3' | 'L4',
  scope_id: string | null,
  kind: string,
  topic: string | null,
  title: string,
  body: string,
  format: 'markdown' | 'toon',
  status: 'captured' | 'provisional' | 'validated' | 'active' | 'stale' | 'archived',
  version: number,
  updated_by: string,
  meta: Record<string, unknown>
}
```

**RevisionLogEntry shape (for bets):**
```
{ timestamp: string, field: string, old_value: unknown, new_value: unknown, reason: string }
```

**Event bus guarantees:** Per-stream ordering (same stream ID events arrive in order), at-least-once delivery (emitted after database write durability).

**WebSocket push contract:** All real-time endpoints (`/api/ws/*`) deliver updates in same shape as corresponding REST response + `_event: 'update' | 'delete'` field.

**Harness error taxonomy:** `InvalidTransitionError`, `VersionConflictError`, `CapacityExceededError`, `CostCapExceededError`, `ConcurrencyLimitError`, `MissingCredentialError`, `ActiveRoutinesError`.

**8-state task lifecycle:** proposed → accepted → hold → in_progress → blocked → review → done → killed. `hold` auto-transitions to `accepted` when all dependencies complete.

**10 verdict actions:** approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate. Keyboard shortcuts: A, A+C, C, I, R, E, X, ↵, S, ↑.

**5 ArtifactView shapes:** text_diff, content_preview, visual_comparison, action_summary, data_metrics.

---

## UI Stack & Component Budget

**Foundation:** Tailwind CSS + DaisyUI + custom `factory-dark` theme (surfaces, accents, text hierarchy, radius, fonts).

**Behavior:** `focus-trap-react` (modals), `@floating-ui/react` (positioning).

**Custom components:** 19 total across three tiers:
- **Tier 1 (5):** StatusChip, Tag, KeyValue, NavItem, SearchField
- **Tier 2 (6):** ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow
- **Tier 3 (8):** IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector

---

## Implementation Tracks & Dependency Graph

Eight parallel tracks. Within each track, stories are sequential. Tracks run in parallel where dependencies allow.

Critical path: **A1 → A2 → B1 → B2 → B4 → C3 → D5 → E6 → UI-00 → UI-10 → UI-20 → UI-30 → UI-31 → UI-32 → UI-40 → G1 → G2 → G3 → G4 → H4**

Parallel windows:
- B (Knowledge Fabric) and C (Process Primitives) fully parallel after A2.
- E (API Layer) starts after A3.
- D (Agent Runtime) needs B2 + C3 before starting.
- UI starts after E6 (all endpoints).
- G (Facilitators) needs D4 + B4 + C5.
- H (Operations) can start once D5 core loop works.

```
A1 ─► A2 ─► A3
      │      │
      ├──────┼─► B1 ─► B2 ─► B3 ─► B4 ─► B5 ─► B6
      │      │
      ├──────┼─► C1 ─► C2 ─► C3 ─► C4 ─► C5 ─► C6 ─► C7
      │      │
      │      ├─► E1 ─► E2 ─► E3 ─► E4 ─► E5 ─► E6
      │      │         │                         │
      │      │         │                         └─► UI-00 ─► UI-10 ─► UI-20 ─► UI-30 ─► UI-31 ─► UI-40 ─► UI-50
      │      │         │                              │      │      │      │      │                    │
      │      │         │                              └──────┘      │      │      └─── UI-32 ─────────┘
      │      │         │                                           UI-42  UI-45 (parallel with UI-31/32)
      │      │
      ├──────┼───────────────────────► D1 ─► D2 ─► D3 ─► D4 ─► D5
      │      │                                              │
      │      └──────────────────────────────────────────────┼─► G1 ─► G2 ─► G3 ─► G4
      │                                                     │
      └─────────────────────────────────────────────────────┴─► H1 ─► H2 ─► H3 ─► H4
```

---
