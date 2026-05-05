# L18 — Concept Probe

## What does L18 add on top of L1?

L1 already shipped the Thread primitive — a host-attached, append-only chronological message stream. **L18 adds nothing to the data model.** It does two integration acts on top of L1:

1. **Surface attachment.** Mount the existing L1 `ThreadShell` on Bet detail, Task detail (already wired by L15's `TaskSheet` → host=task), Knowledge entry detail, and — for the first time — the Artifact detail surface. Discussion of an artifact now lives **on the artifact itself**.
2. **Volume management at the bet view.** A bet aggregates many artifacts; each artifact may carry its own thread; the bet view must not drown. L18 introduces a *summarising* affordance on the bet view that surfaces attached-artifact-thread activity at a glance, and links through to the full thread on the artifact's detail surface. The summary is a UI affordance, **not** a data-model rule (per AC §622).

Block-anchored discussion (AC §623) reuses **L2's own** block-anchor affordance (`BlockHandle` / `BlockActionsPopover` already shipped in `packages/design-system/src/`) — there is no new linking primitive. A "comment on this block" action emits a thread message tagged with the block id; rendering attaches the message to the block via the existing block-id attribute.

## Confirmations against L1

- **Host-kind `artifact` is already in L1's closed set.** `docs/human-interface-layer/thread-primitive.md:16` reads: `Host kinds (closed): bet | task | knowledge_item | artifact | agent | user | team | factory`. The model already permits artifact-attached threads — L1 simply did not surface them; L18 surfaces them.
- **No previous "no artifact-attached threads" rule exists in the L1 data model.** The closed enum allows `artifact` already; the prior restriction was a UI-only choice (no surface). The reframe in AC §620 ("every discussion is a thread, including discussions on artifacts") is honoured purely by mounting a surface.
- **No schema migration is required.** `packages/db/src/schema.ts:179` shows `host_kind text not null` — opaque string; no Drizzle enum to extend; no migration needed (architecture confirms via inspection).
- **The existing route filter `GET /api/threads?host_kind=artifact&host_id=…` already works.** No route change for the per-artifact lookup. The summarisation endpoint at the bet level is novel — see architecture.

## Cross-references

- `docs/process-layer/the-five-primitives.md` §3.1: `Bet.thread` field is documented as "the bet-level conversation thread (optional)" — L18 makes that thread real-data-backed (no comment fixture). §3.2: `Task.thread?` is "optional" — L18 makes it lazily-created on first message via the same resolve-or-create dance L15 already established.
- `docs/human-interface-layer/thread-primitive.md`: closed host-kind enum includes `artifact`; rules of immutability (host_kind/host_id) and idempotency (`(thread_id, sender, client_key)`) are inherited by every L18 surface — L18 introduces no new authority story.
- `docs/process-layer/artifact-primitive.md` line 42: "Threads (L1) attach to Artifacts via the universal cross-area attachment contract." This contract already exists; L18 is the first consumer.

## What L18 is NOT

- Not a new primitive. No new noun.
- Not a new message type. The verdict-grammar set is closed at `plain | review | questionnaire | verdict`.
- Not a comment table. There is no parallel `comments` entity. The legacy `BetComment[]` array on `BetDetail` (`packages/web/src/types/bet.ts:14,37`) is **removed** by L18.
- Not a new server entity. No new tables, no new columns, no new event types.
- Not block-anchor design. Block-anchor is L2's affordance; L18 consumes it.

## Open questions raised by the probe

None that block design. One small one for architecture: the summarising endpoint shape (count + last-message snippet per artifact thread) is novel — architecture must decide whether it is a new endpoint (`GET /api/bets/:id/artifact-thread-summary`) or an extension of the existing artifacts list (`GET /api/artifacts?bet_id=…&include=thread_summary`). Recommendation: extend `/api/artifacts` — see architecture §API.

## No BLOCKER

The story is integration. Concept is intact. Proceed to design.
