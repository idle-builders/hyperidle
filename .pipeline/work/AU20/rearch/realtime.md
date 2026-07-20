# realtime — Service-as-Product Design (AU20 re-architecture, BOTH lenses)

**Layer:** core-api · **Owned tables:** 0 · **Substrate:** external-api (WebSocket transport + in-process EventBus)
**Census now:** 2 value exports / 3 types (5 exports). **Operational surface now:** 9 methods / 3 types.
**Target:** 9 methods / 3 types — **already at floor. Confirm and hold.**

---

## 1. INSIDE-OUT (anchor)

### Substrate — external-api ADAPTER (not internal-logic)

`realtime` owns **zero tables**. It is not arbitrary logic — it is an **adapter over an external
capability**: the **WebSocket transport** (live socket connections, the `WsClient.send` seam) driven
off the **in-process `EventBus`**. Its job: turn internal domain events into **topic-scoped WebSocket
frames**, and decide whether a connected client is **allowed** to receive a given topic. It is the one
core→UI push plane.

This is the (b) case in the frame — a **topic pub/sub fan-out adapter**, exactly analogous to the
`HarnessAdapter (spawn/send/stream/stop)` example: a small **unified** operation set over the transport,
parameterized by a single `topic` string — **NOT** a method per topic class
(`broadcastThreadEvent` / `broadcastWorkEvent` / `broadcastSessionEvent`) and **NOT** the union of every
underlying event's shape.

### The FLOOR — minimal unified pub/sub fan-out surface (8 ops)

The coherent adapter surface needed to drive the ws transport as a topic fan-out plane:

| # | Op | Role |
|---|---|---|
| 1 | `start()` | bind the EventBus → topic routing (open the plane) |
| 2 | `stop()` | unbind (close the plane) |
| 3 | `addClient(client, senderId?)` | register a live socket + its authenticated identity |
| 4 | `removeClient(client)` | deregister |
| 5 | `subscribe(client, topic)` | join a topic (authz-gated) → `SubscribeResult` |
| 6 | `unsubscribe(client, topic)` | leave a topic |
| 7 | `broadcast(topic, data)` | fan-out a frame to all subscribers of a topic |
| 8 | `clientCount` | introspection / health |

All eight are **parameterized by `topic: string`** — a new topic class (`routine:<id>`) or a new
forwarded event needs **zero** new methods. Event→topic mapping is an **internal** declarative
`BROADCAST_ROUTES` table (one row per forwarded event), not public surface — the INSIDE analog of
"parameterize, don't multiply."

### Genuine owned capability beyond bare pub/sub (+1)

| # | Op | Why it is genuinely owned |
|---|---|---|
| 9 | `canSubscribe(senderId, topic)` | **Subscription authorization** — the confidentiality doorman. A fan-out plane without per-topic authz is a leak (L1a `thread:<id>` participant guard; AF11 `session:<id>` fail-closed). Fail-closed, one `switch` over topic-prefix (`thread:` → participant, `session:` → host-scope-must-exist, global → open). Each new topic class is one branch, not a new export. |

**Floor = 8 (unified fan-out) + 1 (authz doorman) = 9 operations across 2 coherent product surfaces.**
Nothing else is genuinely owned. There is no persistence, no domain logic — the four downward reads
(`conversation`/`users`/`org`/`work`) + the direct `sessions` read are **pure authz lookups** injected
via one DI bundle, not owned capability.

---

## 2. OUTSIDE-IN (real demand)

**Service consumers in the census: 0 — and that is correct.** An edge-push leaf's "consumer" is the
**transport route**, not another domain service. Domain services never call `realtime`; they emit on the
`EventBus`, which `realtime` consumes internally. The two real wirers:

- **`packages/server/src/routes/ws.ts`** (the WS route) demands exactly: register/deregister a socket
  (`addClient`/`removeClient`), `subscribe`/`unsubscribe` it to a topic, and a **branchable outcome**
  (`ok` / `forbidden` / `unknown_client`) so it can emit a structured `{error:"forbidden"}` frame.
- **`packages/server/src/server-factory.ts`** (composition root) demands: construct the plane, wire the
  authz `deps` bundle, `start()` it.

That is the **entire** demand: socket lifecycle + authz-gated subscribe + fail-closed outcome. No caller
wants a per-event or per-topic method — they want the parameterized `subscribe(topic)` / `broadcast(topic)`
pair. Demand and floor **coincide**.

---

## 3. THE COHERENT PRODUCT API (fused)

Two composable value surfaces + three load-bearing types. Both lenses land on the same shape.

| Export | Kind | Shape | Lens | Source |
|---|---|---|---|---|
| `WsBroadcaster` | class | `start/stop`, `addClient/removeClient`, `subscribe/unsubscribe(client, topic)`, `broadcast(topic, data)`, `clientCount` | both | INSIDE: the unified ws fan-out adapter (ops 1–8). OUTSIDE: the WS route's exact lifecycle + subscribe demand. `subscribe`/`broadcast` are already topic-string generic — the north-star shape. |
| `createDbSubscribeAuthorizer` | factory → `{ canSubscribe(senderId, topic) }` | `(db, deps) → SubscribeAuthorizer` | both | INSIDE: the owned confidentiality doorman (op 9). OUTSIDE: the route needs a subscribe decision it can branch on. One method, parameterized by `topic`; every topic class is an internal branch. |
| `SubscribeAuthorizerDeps` | type | `{ conversation, users, org, work }` reader ports | inside-out | The single DI seam. Subsumes the 7 collapsed leaf reader/row types (now file-internal). |
| `SubscribeResult` | type | `"ok" \| "forbidden" \| "unknown_client"` | outside-in | The route branches on this to emit the structured L1a error frame. Load-bearing. |
| `WsClient` | type | `{ send(data: string): void }` | inside-out | The ws transport contract the route implements. Load-bearing external seam. |

**Scaling proof (sub-linear):** more forwarded events → one `BROADCAST_ROUTES` row, **0 new exports**;
more topic classes (`routine:<id>`) → `subscribe`/`broadcast` already generic + one `canSubscribe` branch,
**0 new exports**; more authz reads → extend the `SubscribeAuthorizerDeps` bundle (one internal type),
**0 new methods**.

---

## 4. TARGET NUMBERS + completeness

- **targetMethods = 9** (floor 8 unified fan-out + 1 genuine authz capability). No method above floor.
- **targetTypes = 3** (`SubscribeAuthorizerDeps`, `SubscribeResult`, `WsClient` — each load-bearing).
- **Already at target.** The AU20 Ab2 collapse already: (a) removed the **7 leaf DI reader/row types**
  (`Realtime{Thread,User,OrgTeam,Task}Reader` + `Realtime{Thread,User,TeamMembers}Row`) from the public
  surface, folding them into `SubscribeAuthorizerDeps` (12 → 5 exports); (b) replaced **16 imperative
  `eventBus.on()` blocks** with one declarative `BROADCAST_ROUTES` table.

### DELETED (not internalized) to reach floor
The 7 leaf DI types were **removed from the public barrel** (deletion of public surface) and survive only
as file-internal structural interfaces — no caller names them. Nothing further to delete; the service
sits **exactly** at its substrate-appropriate floor.

### Completeness — every real feature still deliverable
- Real-time thread updates (append/resolve/reopen/archive) → `thread:<id>` topic via `broadcast`, gated by
  participant `canSubscribe`. ✓
- Work/portfolio live invalidation (task/bet state, cost-cap, propagation, artifact) → `work` global topic. ✓
- Conversation list live updates (item/thread/knowledge created) → `conversations` global topic. ✓
- Session observe mode (start/end/tool-call) → `session:<id>` topic, host-scope fail-closed authz. ✓
- Structured forbidden frame on unauthorized subscribe → `SubscribeResult`. ✓
No current user feature loses reachability; all flow through the two parameterized interfaces.

**Confidence: high** — 0 tables, empty consumer set, fully-read source; the design confirms the existing
shape rather than proposing a speculative one.
