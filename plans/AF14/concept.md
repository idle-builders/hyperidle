# AF14 — Concept verdict

**Verdict: SATISFIED.** AF14 introduces no new primitive and reshapes no existing one. It is a correctness/bugfix workpackage operating entirely *inside* concepts locked by prior workpackages (L1 Thread, L8 thread list, L9 detail surface, L21/AD8b Assistant overlay). No `concept-missing`.

## Central nouns — all STABLE

| Noun | Status | Locked by | Working definition |
|---|---|---|---|
| **Thread** | Stable | L1, `docs/human-interface-layer/thread-primitive.md` | Container of messages attached to a host entity; ordered by `(last_active_at, id)`; opaque server id. |
| **Message** | Stable | L1 | Element inside a thread (plain / review / questionnaire / verdict). |
| **Conversation (view)** | Stable | L9, `docs/information-architecture/conversations-view.md` | The primary surface — thread list + single detail pane. |
| **Assistant thread / AssistantOverlay** | Stable | AD8b | Resolve-or-create per-user assistant thread (host=user, hostId=userId); overlay renders it with tool-call summary rows. |
| **DM** | Stable | thread-primitive.md §Configurations | A thread configuration: host=agent/user, two participants. Not a typed enum — a recognizable shape. |

AF14 *uses* all of these as-is. The defects are violations of existing concept contracts, not gaps in the concept.

## Concept facts that constrain AF14 (and why no reshape is needed)

1. **Ordering is already specified.** thread-primitive.md §Identity: "ordering by `(created_at, id)` ascending" for messages; the list orders by `last_active_at` (conversations-view.md §Ordering: "blocking → … → resolved", recency within). The server (`GET /api/threads`) already returns rows in `desc(lastActiveAt), desc(id)` order. The UUID-sort bug is a **frontend** violation of this locked contract (the flat-list comparator parses a relative-time *display* string to `NaN`). Fixing it restores the concept; it does not reshape ordering.

2. **Blocking is a DERIVED property with unbuilt backing state.** thread-primitive.md §19: "a thread is *blocking* iff the agent participating cannot continue to work without an answer." This derivation requires agent-session-state plumbing that AF14's dependency chain (AF7 → real sessions) does **not** yet produce. The concept exists; its input does not. → The Blocking chip has no real state to match. This is a concept-grounded reason to gate/remove it, not a reshape.

3. **Unread has NO backing concept.** The Thread primitive defines `pinned, blocking(derived), resolvedAt, lastActiveAt, createdAt` — there is **no read-tracking state** (`read_at` / `seen` / per-participant watermark) anywhere in the locked model. conversations-view.md mentions an "unread badge" as a *visual aspiration*, but no primitive backs it. Introducing real unread state would itself be a **new concept** (per-participant read watermark) — explicitly OUT of AF14's correctness scope. → The Unread chip can never match real state and must be removed, not faked.

4. **DM dedup is an idempotency/identity expectation, not a new concept.** thread-primitive.md already commits to dedup at the message level (`(thread_id, sender, client_key)`). "Two participants, host=agent/user" uniquely identifies a DM. Reusing an existing direct thread instead of spawning a duplicate is the natural extension of the existing identity contract for the DM configuration — no concept reshape, a contract enforcement.

5. **Assistant is the canonical name; CoC/CoS/Coach are PURGED.** Per project decision (memory: CoC purge). The half-landed `CocOverlay`→`AssistantOverlay` rename is a naming-hygiene defect, not a concept change. `AssistantOverlay`/`AssistantContext`/`useAssistantThread` are the canonical symbols; the stale `Coc*` twins must be deleted, not maintained.

## Rejection list (what AF14 is NOT — concept-level)

- **AF14 is not a read-tracking feature.** No per-participant read watermark, no unread primitive. (Reason: no backing concept exists; building one is a separate WP.)
- **AF14 is not a blocking-detection feature.** It does not build the agent-session-state plumbing that derives `blocking`. (Reason: depends on AF7 producing real sessions.)
- **AF14 is not a polling feature.** Live updates use the existing per-thread WS channel (`thread:<id>`), already wired end-to-end on the backend. (Reason: spec contract + the channel already exists and is participant-authorized.)
- **AF14 is not a thread-titling redesign.** Titles become human-readable from data already available (host title / participant identity), not a new title primitive on the Thread. (Reason: stays inside L9's title-resolution approach.)

## Vocabulary (enforced, no reshape)

| Term | Canonical | Aliases NOT to use |
|---|---|---|
| Assistant overlay | `AssistantOverlay` / `AssistantContext` / `useAssistantThread` | CocOverlay, CocContext, useCocThread, CoC, CoS, Chief of Staff, Coach |
| Thread recency key | `lastActiveAt` (ISO) | the display `timestamp` string ("5m", "just now") — display-only, never a sort key |
| Direct thread | DM (host=agent/user, two participants) | "private chat", "1:1 channel" |

## Required reading for `/architecture` and `/pipeline`

- `docs/human-interface-layer/thread-primitive.md` — ordering, blocking-derived, DM configuration, idempotency/identity contracts.
- `docs/information-architecture/conversations-view.md` — list ordering, filter bar, unread-badge aspiration (and why it is unbacked).
- Prior plans (context, not re-litigation): `plans/AD8b/` (assistant rename), `plans/L8/`, `plans/L9/`, `plans/L21/`.

## Self-critique (Phase 6)

- Rejection list is four *distinct* things (read-tracking, blocking-detection, polling, titling redesign), not flavors of one. ✓
- No vocabulary collision: `AssistantOverlay` is already canonical; the collision is the *stale* `Coc*` twin, which AF14 deletes. ✓
- Contracts cited are concrete (line refs to thread-primitive.md), not hand-waved. ✓
- The load-bearing concept finding is #3: **unread has no backing state** — this is the decisive input to the filter-chip design decision and to the "remove rather than fake" contract. Surfaced explicitly so `/design` and `/architecture` cannot silently re-fake it.
