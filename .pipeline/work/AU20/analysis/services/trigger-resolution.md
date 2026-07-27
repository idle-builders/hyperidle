# trigger-resolution — Service-as-Product Audit (AU20)

Layer: agent-orchestration · Current public exports: 9 · Owned table: `triggerResolutionHistory`

## 1. Existence / Consolidation verdict — **CONSOLIDATE** (dissolve into the `session-requests` core of a merged `durable-agent-queue`)

### What it actually is
`trigger-resolution` is the **admission policy of the agent-work queue**: given a source event
(`task`/`assistant`/`routine`/`knowledge`/`decomposition`/`proposed_call`), it (a) reads trigger
config rules from `settings`, (b) scores candidates by specificity/priority, (c) checks agent
eligibility via `users`+`org`, and if it fires (d) **creates the session request in `session-requests`**
and (e) records the outcome in its own `triggerResolutionHistory`. It is the front door that turns an
event into durable agent-work; `session-requests` is the store that durable-work lands in.

### The tell: a bidirectional cycle that is pure table-ownership artifact
- **Forward:** `trigger-resolution` → `session-requests` (`findByIdempotencyKey`, `create`).
- **Back:** `session-requests` → `trigger-resolution` (`recordSessionForResolutionHistory`).

The back-edge exists for exactly one reason: `session-requests.markRequestRunning` needs to backfill
`sessionId` onto `triggerResolutionHistory` — a table `trigger-resolution` owns, so the write had to be
extracted into a callback port (documented in `trigger-resolution.ts` lines 168–191 as an Increment-3b
"census correction"). This is the **table-ownership-as-boundary anti-pattern the frame rejects**: two
services split a single admission→enqueue flow only because the resolution-history rows and the request
rows sit in different tables. Fold them and the cycle vanishes — both directions become internal calls.

### Why the AU19 "why separate" claim fails
AU19 justifies the boundary as: *"owns a real table (`triggerResolutionHistory`) … part of the AC-9
durable-handoff guarantee."* Owning a table is explicitly **not** a product boundary (frame). The
durable-handoff guarantee is a property of **the queue as a whole** — resolution history is just the
admission-decision column-set of the same durable-work record. It does not name a distinct customer or a
distinct product; it names a table.

### Consumers (real demand, from code, not the mis-aggregated data package)
- `createTriggeredAgentSessionRequest` — called by **`dispatch`** (`agent-work-assistant.ts`) and the
  `core-api` composition root. This is the one true forward consumer.
- `recordSessionForResolutionHistory` — called **only by `session-requests`** (the back-edge above).
- `resolveTriggerForSessionRequest` — **zero external callers**; internal-only helper of
  `createTriggeredAgentSessionRequest`, exported for no reason.

So the live external demand is a **single admission entry point** (dispatch) plus an **internal backfill**
that only exists because of the table split. That is not two products; it is one queue with an admission
front-door.

### Cluster-hypothesis evaluation (`durable-agent-queue` = session-requests + trigger-resolution + lifecycle-projection)
**Endorsed for trigger-resolution.** It is the strongest dissolve candidate in the roster: 1 real
forward consumer, a bidirectional cycle with the very sibling it would merge into, and a boundary
justified solely by table ownership. Folding it into `session-requests`:
- removes the cycle (recordSession… + create + findByIdempotencyKey all become internal),
- collapses 4 of the 5 DI port types into `session-requests`' existing deps bag (it already injects
  `users`/`org`; only the `settings.listResolvedConfiguration` read is newly added),
- loses **zero** capability — dispatch still gets one call to admit a triggered request.

Its `settings`/`users`/`org` reads remain ordinary downward edges after the merge, so no new against-grain
coupling is created.

## 2. Deliberate target public API — **2 exports (down from 9)**

After the merge, `trigger-resolution`'s contribution to `durable-agent-queue` is a single composable
capability plus its parameterized input:

| # | Interface | Shape | Subsumes | Why it's a meaningful shared capability |
|---|-----------|-------|----------|------------------------------------------|
| 1 | **`admitTriggeredRequest`** | `admit(db, event: TriggeredSessionRequestInput, deps) → { request, resolution }` | `createTriggeredAgentSessionRequest` (public), `resolveTriggerForSessionRequest` (→ internal), `recordSessionForResolutionHistory` (→ internal backfill inside the queue's `markRequestRunning`) | The **one admission front-door of the durable queue**: idempotently resolve an event to an agent+prompt and enqueue it, recording history either way. Already parameterized by `event` over all 6 source kinds via `PROMPT_MODE_BY_SOURCE` — one method, not one per source. |
| 2 | **`TriggeredSessionRequestInput`** (type) | Event descriptor: `eventType/sourceKind/sourceId/streamId/defaultAgentId/idempotencyKey/sourceCorrelation` + optional `buildSourceCorrelation` callback/`teamId`/`userId`/`taskId`/`payload` | itself | The single filter/intent object that lets one admission method serve every trigger source. `buildSourceCorrelation` is a field on this input, not a separate export. |

**Collapses to zero public surface:**
- The 5 DI port types (`TriggerResolutionConfigReader/Deps/SessionRequestPort/TeamReader/UserReader`) —
  the `SessionRequestPort` disappears entirely (internal call); `Config/Team/User` readers merge into
  `session-requests`' existing deps bag. None are product capabilities; they describe what the code
  *needs*, not what it *offers*.
- `resolveTriggerForSessionRequest` and `recordSessionForResolutionHistory` become non-exported
  internal functions.

## 3. Inside lens — staying clean/evolvable
- The pure decision core (`specificityFor`/`compareCandidates`/candidate ranking) is already a
  self-contained, side-effect-free scorer — keep it as an internal module inside the merged service;
  it stays unit-testable without DB.
- One admission function orchestrates: resolve (pure) → eligibility (users/org) → enqueue
  (`session-requests`, now internal) → persist history (own table, now internal). Removing the port
  indirection makes the flow readable top-to-bottom with no callback round-trip.
- `triggerResolutionHistory` becomes a private table of the merged service alongside the request tables —
  the durable-handoff record and the admission-decision record live together, which is what AC-9 actually
  wants.

## 4. Scaling argument — sub-linear
The admission surface is **one general method keyed by an event descriptor**, not a method per source
kind. Adding a new trigger source (e.g. `webhook`) today would tempt a `createWebhookTriggeredRequest`;
under the target it is a new `sourceKind` value + a `PROMPT_MODE_BY_SOURCE` entry — **zero new exports**.
Adding a new *consumer* (say a future scheduler service) composes the existing `admitTriggeredRequest`
call; it does not add a method. Contrast the failing shape — `admitTaskTrigger` / `admitRoutineTrigger` /
`admitProposedCall` — which grows one method per source and per caller. The parameterized
`admit(event)` absorbs both axes without growth: dozens more services and hundreds more calls still route
through the same two symbols.

## 5. Key collapses
1. **9 → 2 public exports.** The 5 DI port *types* (55% of the surface) are DI plumbing, not product
   capability — they evaporate into `session-requests`' existing deps on merge.
2. **3 functions → 1 public.** `resolveTriggerForSessionRequest` (no external caller) and
   `recordSessionForResolutionHistory` (back-edge only) become internal; only `admitTriggeredRequest`
   stays public.
3. **Bidirectional `trigger-resolution ⇄ session-requests` cycle eliminated** — the
   `recordSessionForResolutionHistory` callback port existed solely because `markRequestRunning` wrote a
   foreign-owned table; after merge it is a local update.
4. **A whole service boundary retired** — one fewer package, barrel, ports file, and composition-root
   wiring seam; the admission policy sits next to the queue it admits into.
