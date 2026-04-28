# Work Packages — HyperIdle Implementation

Agent-friendly user stories organized in tracks with outcome-level acceptance criteria.

**Track files:** [Track A](TRACK-A.md) | [Track B](TRACK-B.md) | [Track C](TRACK-C.md) | [Track D](TRACK-D.md) | [Track E](TRACK-E.md) | [Track F](TRACK-F.md) | [Track G](TRACK-G.md) | [Track H](TRACK-H.md) | [Track I](TRACK-I.md) | [Track J](TRACK-J.md) | [Track K](TRACK-K.md) | [Track L](TRACK-L.md)

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

**Block primitive (L2):** the shape every consumer of structured prose imports. Concept: [`docs/concept/BLOCKS.md`](../concept/BLOCKS.md). Hard rule: on-disk format stays GitHub-flavoured markdown — Blocks are derived during ingestion, never stored as a dialect.

```
// Closed enum: nine content kinds + one `unknown` sentinel = ten total.
// New kinds require updating BLOCKS.md § 6 first. Body-level metadata (front
// matter) is NOT a kind — it rides on the sibling `metadata` field below.
type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'code'
  | 'table'
  | 'divider'
  | 'image'
  | 'html'
  | 'unknown'

// Stable id derived from normalised content + outline path. Algorithm: BLOCKS.md § 8.4.
// Format: hex-encoded 128-bit cryptographic hash of (version || kind || outlinePath || normalisedPayload).
type BlockId = string  // opaque

// The anchor IS the primitive's own affordance — no separate linking primitive.
// Threads attach via { kind: 'block', blockId, hostKind, hostId } per L1.
// L1's closed attachment-kind enum is bet | task | knowledge_item | artifact |
// agent | user; L2 extends it by adding `block` as the seventh kind (see
// BLOCKS.md § 4 / § 8.5 hard rule 4).
type BlockAnchor = { blockId: BlockId }

// `hostKind` is the closed L1 host enum — no `string` escape hatch. SHARED.md
// is single-source-of-truth, not a place where one story can quietly weaken
// another's closure.
type BlockHostKind = 'bet' | 'task' | 'knowledge_item' | 'artifact' | 'agent' | 'user'

type Block = {
  id: BlockId
  kind: BlockKind
  source: { hostKind: BlockHostKind; hostId: string; bodyDigest: string; range: { start: number; end: number } }
  payload: BlockPayload  // discriminated by kind; see BLOCKS.md § 6
  anchor: BlockAnchor
  order: number          // informational only — never used for identity
}

// Pure, deterministic. No I/O, no clock, no DB. Same input -> same output.
// Lives in `packages/shared` and is imported by both server and web — both
// processes use byte-identical code paths (see BLOCKS.md § 10).
//
// L2 ships without body-level metadata parsing — front matter is treated as
// markdown by remark and either becomes a `divider` + `paragraph` pair (when
// the host body uses three-dash fences) or routes to `unknown`. A typed
// metadata pipeline is deferred until a concrete consumer arrives.
function deriveBlocks(
  body: string,
  host: { kind: BlockHostKind; id: string },
): { blocks: Block[] }
```

Consumer rules (every story below references these, not its own copy):
- L16 (bet pitch) and L23 (knowledge body) render through `Block[]` derived by the shared `deriveBlocks`. Both round-trip GFM losslessly for the nine content kinds.
- L26 (per-block discussion on Knowledge) attaches L1 Threads via `BlockAnchor`. There is no parallel comment table; there is no L24 (linking primitive) dependency.
- The `bodyDigest` field on the source body is the cache key. Re-derivation on body edit is automatic.
- `unknown` is the safety valve — derivation never throws. New GFM features land before the kind set is updated.

---

## UI Stack & Component Budget

**Foundation:** Tailwind CSS + DaisyUI + custom `factory-dark` theme (surfaces, accents, text hierarchy, radius, fonts).

**Behavior:** `focus-trap-react` (modals), `@floating-ui/react` (positioning).

**Custom components:** No strict count enforced. Create new components only when necessary, as decided by the designer. Prefer composition inside existing components when possible. Current baseline:
- **Tier 1:** StatusChip, Tag, KeyValue, NavItem, SearchField
- **Tier 2:** ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow, ReasoningBlockView (renamed from `ReasoningBlock` to disambiguate from the L2 Block content primitive — see `docs/concept/BLOCKS.md` § 7. The TSX rename is implementation work for whichever story first touches the component; the name in this list is canonical from this concept-doc pass forward.)
- **Tier 3:** IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector

---

## Implementation Tracks & Dependency Graph

Nine implementation tracks plus one design-synthesis adoption track. Within each track, stories are sequential. Tracks run in parallel where dependencies allow.

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
