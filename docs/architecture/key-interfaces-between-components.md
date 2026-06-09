## 4. Key Interfaces Between Components

### 4.1 Agent → Process Layer (via skills)

Agents interact with HyperIdle through skills that wrap the process layer's APIs:

```
read_inbox()              → GET /agents/:id/inbox
send_message(to, msg)     → POST /agents/:to/inbox
log_task(task_id, msg)    → PATCH /tasks/:id (append to notes)
query_practice(topic)     → GET /knowledge/l3/:community?q=topic
write_memory(layer, k, v) → POST /knowledge/:layer
handoff_to(agent, msg)    → POST /tasks/:id/handoff
create_item(item)         → POST /items (surfaces to human)
write_session_notes(notes) → PATCH /sessions/:id (called before context compaction)
```

These are thin wrappers — they call the API Layer directly via HTTP or, in a single-process deployment, via function call.

### 4.2 Process Layer → Harness (via Harness Adapter)

When the Scheduler determines an agent should start a session (routine fired, dependency met, inbox message arrived):

```
1. Scheduler emits event
2. Scheduler selects model tier based on task risk_tier + routine type + cost posture
3. Harness Adapter receives event
4. Adapter calls Knowledge Fabric: build_session_context(agent, task) → TOON pack
5. Adapter calls Workspace Adapter: spawn(config) or reuse existing workspace
6. Adapter calls Harness: start_session(agent, context, task, workspace, model_tier)
7. Harness runs the agent (model calls, tool use — all inside the harness)
8. Agent uses skills to interact with process layer (inbox, memory, items, task notes)
9. Session nears context compaction → agent writes session notes to task
10. Session ends (compaction imminent, task done, or explicit stop)
11. Adapter calls: stop_session → SessionResult
12. Adapter writes session result to Primitive Store
13. Event emitted: session_ended
```

### 4.3 Process Layer → Human Interface (via API + Events)

The API Layer serves the Factory app. State flows in two directions:

**Down (meta → UI):** Items, thread updates, system status, Work data (bets + tasks), Knowledge trees. Delivered via REST endpoints (initial load) and WebSocket (real-time updates).

**Up (UI → meta):** Responses (verdicts, comments, edits), Work actions (commit bet, kill pitch, revise bet), Knowledge actions (merge, split, flag, archive).

### 4.4 Facilitator → Router → Human Interface

Facilitators are agents, but their output is special: they produce Items that need routing to the right human view. The flow:

```
1. Facilitator (running as an agent session) creates an Item via create_item()
2. Item is written to Primitive Store
3. Event: item_created
4. Router evaluates the Item's characteristics → routing decision
5. Router determines recipient founder(s) based on domain
6. Routing decision stored on the Item (target view, notification policy, recipient)
7. Notification Adapter fires if push is required
8. API Layer pushes the Item to connected clients via WebSocket
9. Factory app renders the Item in the target view
```

---
