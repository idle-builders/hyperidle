# L15 — Concept: "Request" on a task

## Identity

L15 does NOT introduce a new primitive. It uses the existing **Thread** primitive (L1) and its existing **Message** discriminated union (`plain | review | questionnaire | verdict`). The load-bearing noun L15 introduces at the surface — **Request** — is NOT a new entity. It is a **convention** for a `plain` message authored by a human against a task-attached thread.

A Request is not a Verdict. A Verdict resolves an open review or questionnaire that an agent posted. A Request is the inverse direction: a human authors prose that asks the agent to consider a state change. The agent's response — to honor the request, decline it, ask back — flows through ordinary thread messages. The closure of a Request is the agent's subsequent action (state change, or counter-message), not a structured verdict on the request itself.

## Probes settled

### Probe 1 — Is "Request" a new noun, or a metadata flavor on an existing Message?

**Settled: it is a `plain` message.** No new MessageType, no new payload variant, no `metadata.request_kind` field on the wire. Reasons:

1. The `MESSAGE_TYPES` enum (`packages/shared/src/thread.ts:29`) is closed: `["plain", "review", "questionnaire", "verdict"]`. Adding a fifth would ripple through `messageInputSchema`, `messageRowSchema`, `MessageTypesCovered`, `headCollapsePredicate`, `promotedRichMessageId`, `verdictDecisionLabel`, the WS broadcaster, the rail, and L11's promoted-rich-card surface. None of those sites need to know about Requests.
2. Request DOES NOT mount as a head (`headCollapsePredicate` only mounts unresolved review/questionnaire). Request DOES NOT appear on the rail as a blocking item. Request DOES NOT need verdict authorization. All three drop out for free if Request is `plain`.
3. The agent answer model is "the agent decides whether to honor it" — explicitly NOT a structured approve/reject vocabulary that the user has authority to issue. So the request is not headed, and the human is not commanding.
4. Discoverability of the kind ("this message is a state-change request, not free-form chat") is solved at the **prose layer**: the message text is templated by the client (e.g. `Request: move to BLOCKED — <free-form why>`). Future search / filter use can index the text or the client can add a UI-only display tag derived by the renderer. Neither requires a schema change.

**What it is NOT:**
- NOT a new MessageType.
- NOT a new payload variant.
- NOT a structured field on Message that ties the request to a target TaskState.
- NOT a verdict on anything.
- NOT mounted on the thread head; never blocks an agent (per `isBlocking`).

### Probe 2 — "The agent decides whether to honor it" — does the request have a status (pending/honored/rejected)?

**Settled: no status.** A Request is fire-and-forget prose. It does not carry `pending → honored | rejected` because:

1. There is no actor authorized to flip its status on the wire. The agent does not "resolve a request" — the agent reads the thread, runs its own loop, and either takes the action or does not. The next session, the agent's reply, or the task's state change IS the response.
2. Adding a status would require a verdict-shaped authorization model on every plain message, which was deliberately rejected in L1.
3. The visible "status" — was the request honored — is **derived** at read time, not stored: `task.state === requested_state` is the natural answer. The UI does not need to expose this derivation in v1; the human can read the thread.

If a future story (post-L18) wants to render "your request was honored" inline, that's a UI-layer overlay over the existing message + task-state pair. Not a v1 concern.

### Probe 3 — Does the affordance require new server endpoints?

**Settled: no.** Reuses existing L1 endpoints:

- **Open thread for a task**: `GET /api/threads?host_kind=task&host_id=<taskId>` lists threads scoped to the task host (already implemented in `packages/server/src/routes/threads.ts:154`). If zero, `POST /api/threads` creates one (existing endpoint, lines 277-378). If one or more, take the first.
- **Post a request**: `POST /api/threads/:id/messages` with `{ type: "plain", payload: { text: <templated> }, clientKey: <uuid> }` (existing, lines 381-596). No new route.

The client wraps both into a single "request flow" helper. The server does not need to know that this `plain` message is a Request.

### Probe 4 — Idempotency: what if a user double-clicks "Request: move to BLOCKED"?

**Settled: handled by the existing L1 idempotency contract.** `POST /api/threads/:id/messages` already requires `clientKey` and treats `(threadId, senderId, clientKey)` as the dedupe key (`threads.ts:424-459`). Two strategies for the client:

1. **Stable clientKey per intent**: when the user opens the request menu and picks "BLOCKED", the client mints `req-<taskId>-blocked-<isoMinute>` (or similar deterministic-ish key). A double-click within the same minute returns the same canonical message — no duplicate row.
2. **Disable button on submit**: the menu closes after the first click; a second click can't fire because the affordance is gone.

Use **(2)** as the UX pattern (immediate menu close, optimistic toast) and rely on **(1)** as the safety net at the wire (random UUID per click, but the server's `clientKey` conflict path catches programmatic resends with identical payloads). The L1 conflict response (409 `idempotency_conflict`) is reserved for clients that mutate the payload under the same clientKey — not a normal-flow concern here.

### Probe 5 — Vocabulary collisions

- "Request" vs. "Review request" (L11 verdict vocabulary): Review's "Request changes" verdict (`request-changes` → "CHANGES REQUESTED") uses the word `request` for an entirely different action. The L15 affordance label MUST avoid the bare word "Request" in isolation when adjacent to a review surface. Use **"Request state"** or **"Ask agent to ..."** instead. The button row on the task card reads as imperatives ("Request blocked", "Request done"), not as a noun phrase that collides with the verdict vocabulary. Designer to settle exact wording in the design phase.
- "Open thread" is the canonical verb (matches L18's "open thread" affordance language; L8's Conversations Submenu shows threads). Do not rename.

### Probe 6 — Drag survives where?

The spec is clear: drag survives ONLY between Shaped → Committed columns on **the Canvas component** (`packages/web/src/shell/Canvas.tsx`), which is a separate file from `Kanban.tsx`. L15 does NOT touch Canvas; it only strips drag from Kanban (the task board). The Canvas's `onMoveBet` handler is the human-owned move per Shape Up shaping and stays.

## Composition

A Request, when posted, is a `Message` row with:

- `type: "plain"`
- `threadId`: the task's attached thread (resolved by `host_kind=task`, `host_id=<taskId>`)
- `senderId`: the founder identity
- `payload.text`: a templated string the client builds from the picked intent and an optional free-form note (e.g. `"Request: move to BLOCKED. <user's note>"` or `"Request: unblock and resume."`)
- `clientKey`: client-minted UUID; idempotent on retry

That's it. The Thread's `lastActiveAt` ticks; if it was previously resolved, it stays resolved (only `review`/`questionnaire` posts re-open per `threads.ts:486`).

## Lifecycle

1. User opens the task affordance → picks an intent (state change or open thread).
2. **Open thread** path: client calls `GET /api/threads?host_kind=task&host_id=<id>`; if empty, `POST /api/threads`; navigates the user to the thread surface (Conversations or inline reader — design call).
3. **Request state-change** path: client resolves/creates the thread (same as above), then `POST /:id/messages` with the templated `plain` payload. The message appears in the thread immediately. The user sees a toast or the optimistically appended message; the menu closes.
4. The agent, on its next session for the task, reads the thread (via L7's session-context contract). It decides. If it honors the request, it transitions the task state through its own state-change call. If not, it replies.

## Authority

- Humans **request** a state change. Humans never call `PATCH /api/tasks/:id { state }` from the Kanban affordance — that's the v3 ownership rule the spec is enforcing.
- Agents **execute** the state change as a side-effect of their session work, after reading the thread.
- The Conversations Review surface (L8) is unaffected: review/questionnaire mounting is unchanged because Requests are plain.

## Vocabulary

| Term | Means |
|------|-------|
| Request | A `plain` thread message authored by a human against a task-attached thread that asks the agent to do something (most commonly a state change). |
| Open thread | The verb for navigating from the task card to its attached thread surface. |
| Honored | (Implicit, derived) — the agent took the requested action. Not a stored field. |
| Drag | Removed everywhere except Canvas Shaped → Committed (Shape Up shaping). |

## Conclusion

The concept work is settled. No new primitive, no schema change, no new endpoint, no new MessageType. L15 is a UI surface that uses L1's existing message-post path with a templated text payload. The "request" vocabulary is convention-only.
