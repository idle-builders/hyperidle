# Q1 Concept Confirmation

**Workpackage:** Human-initiated conversations and session dial-in
**Status:** Concept LOCKED. No new or reshaped nouns require concept work.

---

## Concept Lock Verification

The Q-track concept doc (referenced from `plans/work-packages/TRACK-Q.md`) establishes three locked decisions. Q1 touches two of them:

### 1. Thread (DM configuration) -- STABLE

Q1 creates DM-configured threads using the existing Thread primitive (`docs/human-interface-layer/thread-primitive.md` section 4.5.2). The DM configuration is a recognized pattern: `host=user|agent`, `participants=[sender, recipient]`, `pinned=false`. No new host kinds, message types, or thread configurations are introduced.

The Thread primitive already supports:
- `host_kind` includes `user` and `agent` (covers DM hosts)
- Human-initiated threads (the `initiatorId` can be a human identity)
- `POST /api/threads` creates a thread + initial message atomically
- WebSocket subscription to `thread:<id>` topics for real-time updates

No concept-level changes needed.

### 2. Session Dial-in -- STABLE (design/arch concern only)

Session dial-in is NOT a new primitive. It is a composed view that:
- Reads the task's existing thread (the thread attached to the task the session operates on)
- Overlays session activity data (from `session_started`, `session_ended`, `tool_call_recorded` events already flowing through the EventBus)
- Allows interjection via standard `POST /api/threads/:id/messages` (plain message type)

No new event types, no new message types, no new primitives. The concept is a VIEW composition, not a data model change.

### 3. Collaborative Continuation -- STABLE (principle, not primitive)

The principle that humans and agents are interchangeable authors is already encoded in the Thread primitive: "Agents and humans are equal participants" (section 4.5.6). Q1 simply exercises this existing affordance by letting humans initiate DM threads and interject into task threads.

---

## What Q1 Does NOT Touch

- **Knowledge Items / Scope:** That is Q2's domain.
- **Bet creation:** That is Q3's domain.
- **New message types:** Interjection uses `type: "plain"`. No `type: "interjection"`.
- **Agent interruption semantics:** The agent is NOT notified by observation alone. Interjection is advisory -- the agent reads the message in its thread context next time it checks.
- **New host kinds:** DM threads use existing `user` or `agent` host kinds.

---

## Conclusion

No concept work required for Q1. Proceed directly to `/design` (for the recipient picker, dial-in view composition, and session activity stream UX) and then `/architecture` (for API surface, WebSocket subscriptions, component hierarchy).
