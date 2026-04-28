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

**Thread primitive (TRACK-L L1 — full spec at `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5).**

A Thread is a *container* (no shape of its own) — an append-only chronologically-ordered sequence of typed Messages, attached to exactly one host entity. Differences between "review", "chat", "coach" live on the *messages* (typed shapes) and on the thread's *configuration* (host + pinning + membership), never on the thread itself.

```
Thread {
  id, host_kind, host_id, initiator, participants[],
  pinned, blocking (derived), resolved_at, last_active_at, created_at
}

Message {
  id, thread_id, sender, type, payload, client_key, deleted_at, created_at
}
```

- **Host kinds (closed):** `bet | task | knowledge_item | artifact | agent | user | team | factory`. Adding a host kind requires a concept-doc update first (HIL §4.5). No orphan threads — coach-style threads attach to the user themselves.
- **Message types (closed):** `plain | review | questionnaire | verdict`. Adding a type requires a concept-doc update first. Renderer dispatches via TypeScript discriminant exhaustiveness. A `verdict` message carries `decision` (one of the 5 binding actions) AND `resolvesMessageId` pointing at the review/questionnaire message it terminates.
- **Configurations (descriptive, not enum):** DM (host=agent/user, two participants), coach (host=user, pinned), feed (host=team/factory, broadcast). Recognisable patterns — not a typed enum.
- **Blocking (derived):** a thread is *blocking* iff the agent participating in the thread cannot continue to work without an answer to a message in the thread. Drives ordering (blocking threads sort first).
- **Verdict semantics:** five verdict-grammar actions are binding verdicts that emit a `verdict`-payload message and terminate the review (`approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`). Three emit `plain` messages and do not terminate (`comment`, `inline-comment`, `reply`). Two are sidecar workflow operations and emit no message in the thread (`snooze`, `escalate`).
- **Mutability:** thread `host_kind`/`host_id` immutable after creation, except the `user → factory` re-home on user offboarding. `pinned`, `resolved_at`, `last_active_at` mutable. Message `payload` immutable after persistence (audit invariant); soft-delete via `deleted_at` allowed; redaction allowed via structured replacement payload preserving id/sender/type/created_at.
- **Identity / idempotency:** opaque server ids; ordering by `(created_at, id)` ascending; appends carry `client_key`; uniqueness constraint `(thread_id, sender, client_key)` to dedupe at-least-once retries.
- **Authority:** server-authoritative; every write emits an event to the Event Bus (ARCHITECTURE.md §2.6). Agents and humans are equal participants.
- **Migration policy (L1):** forward-only. Legacy `threads.kind`, `messages.recipient_id`, `messages.subject`, `messages.body`, `messages.file_lease_ids` columns are dropped. Existing rows project: legacy `threads.kind = 'coach'` → host_kind=`user`, host_id=initiator, pinned=true; legacy `kind = 'review' / 'chat'` → host_kind set from the referencing item or task; `recipient_id` folds into `participants`; `subject` + `body` fold into `payload.text` for `type = 'plain'`. The legacy `responses` table is dropped — verdict-payload messages replace it. Rollback: revert the migration; existing data is preserved through a snapshot taken at migration start.

Implementation stories that consume this contract: L7 (verdict commit unblocks agent), L8 (Submenu thread sections), L9 (one detail surface per thread), L11 (rich review messages), L18 (bet detail threads), L21, L26 (per-block discussion via threads on knowledge items).

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

**Artifact primitive (L3).** The function-agnostic, task-rooted record of something the team has produced. Defined in `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.7; producer rule in `docs/concept/PROCESS_LAYER.md` §3. Implementation stories L11 (rich review messages) and L12 (Work surfaces) consume this contract directly.

Canonical shape:
```
Artifact {
  id                  # opaque, stable, immutable
  producing_task_id   # the unique producing Task — required, immutable
  kind                # function-agnostic type label (code diff, deck, contract,
                      # dashboard, screenshot, drafted email, design, data analysis,
                      # decision with rationale, running service, communication draft,
                      # test/verification result, ...) — illustrative, not enumerated
                      # at the SHARED level; closure decided in /architecture
  preview             # short representation for gallery / stack rendering;
                      # null until populated; once populated, immutable
  cost_from_session   # money + tokens contributed by the producing session(s);
                      # null until session settles; once populated, immutable
  created_at
}
```

View family (CLOSED — adding a layout requires a concept-doc update first):
1. `gallery_card` — used in collection surfaces (Bet detail, Product page, Portfolio gallery).
2. `stack_item` — used in vertical lists where Artifacts live alongside other items.
3. `single_full_preview` — used on the Artifact's own detail surface.
4. `review_message_embed` — used inside review messages in Conversations; internally consumes the five `ArtifactView` shapes (text_diff / content_preview / visual_comparison / action_summary / data_metrics) for its preview rendering.

Fetching contract: the system can fetch Artifacts filtered by Task, by Bet (aggregated from Tasks), by Product (aggregated from Bets), or by Portfolio (aggregated from Products). The shape returned is the canonical Artifact above.

Hard rules:
- Artifacts root on Tasks. Bet/Product/Portfolio surfaces aggregate; they never own.
- Threads (L1) attach to Artifacts via the universal cross-area attachment contract.
- The view family is closed at four layouts.
- No fake thumbnails — when `preview` is null, render an explicit placeholder.
- The pre-existing `ArtifactView` (component) is the renderer engine inside the `review_message_embed` layout — not a synonym for the Artifact primitive.

Aliases NOT to use for the primitive: Output, File, Deliverable, Result, Asset, Document.

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
