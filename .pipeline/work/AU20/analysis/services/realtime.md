# realtime — Service-as-Product Audit (AU20)

**Layer:** core-api · **Owned tables:** none · **Current public exports:** 12 · **Target:** 5

## 1. Existence / Consolidation Verdict — **STANDALONE**

`realtime` is a genuine, distinct product: the **core→UI push plane**. It is the one place that
turns internal domain events (`thread_message_appended`, `task_state_changed`, `session_started`,
`cost_cap_warning`, …) into topic-scoped WebSocket frames, and the one place that decides whether a
connected client is *allowed* to receive a given topic. Nothing else in the system owns this
capability.

Two products live here and belong together:
- **Fan-out** — `WsBroadcaster`: a topic pub/sub engine that holds live socket connections and
  routes events to subscribed clients.
- **Subscription authorization** — `createDbSubscribeAuthorizer`: fail-closed access control for a
  topic (thread-participant for `thread:<id>`, host-scope for `session:<id>`, open for the global
  `conversations`/`work` topics).

These are inseparable: a fan-out plane without per-topic authz is a confidentiality leak (the L1a
`thread:<id>` participant guard and the AF11 `session:<id>` fail-closed fix are recorded as `@lore`
in the source). They are the OUTSIDE and the doorman of the same product.

**Consumers (data package): 0 service consumers.** Only the composition root
(`packages/server/src/server-factory.ts`) and the WS route (`packages/server/src/routes/ws.ts`)
wire it. That is EXACTLY correct for an edge-push plane — its "consumer" is the transport route, not
another domain service. Zero service consumers is not a weakness here; it confirms the boundary is a
leaf that no domain reaches into.

**Dependencies (downward, correct):** reads `conversation.getThreadById`, `users.getUserById`,
`org.getTeamMembersById`, `work.getTaskById`, plus a direct `sessions` read (an
`UNOWNED_SHARED_TABLES` row). All four are pure authorization reads — "may this sender see this
topic?" — not domain logic. A cross-cutting read need is inherent to a doorman and does not dilute
the product.

**Candidate-cluster hypothesis — EMPTY, confirmed.** The landscape pass proposed no neighbors, and
the check holds: there is no sibling whose product is "push events to clients" or "authorize a
subscription." Folding fan-out into `conversation` or `work` would re-couple the transport plane to
one domain and duplicate the multi-domain authz reads across every domain that emits events. The
AU19 "not infra of any one domain" claim survives challenge. **Keep the boundary.**

The real critique is not existence — it is that **8 of 12 exports are DI-port scaffolding**, not
product surface. That is the sprawl to collapse (§2).

## 2. Deliberate Target Public API — 12 → **5**

The current 12 split into **4 real surface exports** + **8 DI-port types** carved to mirror each
upstream service's row shape one-for-one. The port bundle is real (Mechanism-C injection keeps the
service from importing sibling packages), but exposing all 7 leaf reader/row types **plus** their
aggregate bundle is method-per-caller sprawl at the type level: one exported type per upstream read.

| Target export | Shape | Subsumes | Why a meaningful shared capability |
|---|---|---|---|
| `WsBroadcaster` | class: `start/stop`, `addClient/removeClient`, `subscribe/unsubscribe(client, topic)`, `broadcast(topic, data)`, `clientCount` | (unchanged) | The entire fan-out product. `subscribe`/`broadcast` are already **parameterized by `topic` string** — the north-star shape. New topic classes and new events need zero new methods. |
| `createDbSubscribeAuthorizer` | `(db, deps) → { canSubscribe(senderId, topic) }` | (unchanged) | The authz product. `canSubscribe` is **one method parameterized by `topic`** — every topic class (thread/session/global) is a branch inside, not a new export. |
| `SubscribeAuthorizerDeps` | injection bundle: `{ conversation, users, org, work }` reader ports | **RealtimeThreadReader/Row, RealtimeUserDirectory/Row, RealtimeOrgTeamReader/TeamMembersRow, RealtimeTaskReader** (7 types) | The single DI seam the composition root wires. The 7 leaf types become **file-internal** interfaces referenced structurally by this bundle — the composition root passes matching function refs and never needs the leaves named. |
| `SubscribeResult` | `"ok" \| "forbidden" \| "unknown_client"` | (unchanged) | The route must branch on the outcome to emit a structured `{error:"forbidden"}` frame (L1a contract). Load-bearing. |
| `WsClient` | `{ send(data: string): void }` | (unchanged) | The transport contract the route implements. Load-bearing. |

**Dropped from the public surface (7):** `RealtimeThreadReader`, `RealtimeThreadRow`,
`RealtimeUserDirectory`, `RealtimeUserRow`, `RealtimeOrgTeamReader`, `RealtimeTeamMembersRow`,
`RealtimeTaskReader`. They stay as internal `interface`s in `ports.ts`, reachable only through
`SubscribeAuthorizerDeps`. No caller references them by name; TypeScript structural typing lets the
composition root pass its existing `org.getTeamMembersById` etc. against the bundle without importing
the leaf types.

**Optional further collapse (to 4), not taken:** fuse the authorizer into a single wired factory
`createWsBroadcaster(db, eventBus, deps)` that returns a started broadcaster with the authorizer
already attached. This removes `createDbSubscribeAuthorizer` from the surface. Not recommended for
MVP: the authorizer is separately unit-tested and the broadcaster/authorizer seam is a legitimate
composition boundary (fan-out is useful in tests without a DB). Keeping it as a composable factory is
the cleaner MVP call. **Target stays 5.**

## 3. Inside Lens — keeping it clean/evolvable

- **Event→topic routing is currently 16 imperative `eventBus.on(...)` blocks** in `start()`, each a
  hardcoded `event → broadcast(topic, ...)` line. Replace with one declarative route table:
  `const ROUTES: Array<[EventName, (e)=>Topic]>` (e.g. `thread_message_appended → thread:${e.threadId}`,
  `cost_cap_warning → "work"`). `start()` becomes a loop over the table. Adding a forwarded event is
  a one-row table edit, not a new `unsubN` variable threaded into the `push(...)` list. This is the
  INSIDE analog of the OUTSIDE "parameterize, don't multiply" rule.
- **Authz stays a single `canSubscribe(topic)` switch** over topic-prefix (`thread:`, `session:`,
  global). Each new topic class is one branch, colocated with the read it needs from `deps`.
- **DI leaf types internal** (§2) shrinks the maintained public contract to the 5 things a consumer
  actually touches, so refactoring an upstream row shape never ripples through `realtime`'s barrel.

## 4. Scaling Argument — sub-linear

Apply the test: *add dozens more services and hundreds more calls — how many new methods?*

- **More forwarded events** (a new `bet_archived`, a new `artifact_updated`): `broadcast(topic, data)`
  already accepts any topic; adding the event is one route-table row. **0 new public exports.**
- **More topic classes** (say `routine:<id>`): `subscribe`/`broadcast` are topic-string generic, and
  `canSubscribe` gains one prefix branch. **0 new public exports** (at most one new internal read on
  the existing `SubscribeAuthorizerDeps` bundle if the branch needs a new authz lookup).
- **More authz reads**: extend the `SubscribeAuthorizerDeps` bundle — one type, DI-internal — never a
  new exported method.

Contrast the failing shape this avoids: had `realtime` exposed `broadcastThreadEvent`,
`broadcastWorkEvent`, `broadcastSessionEvent`, `authorizeThreadTopic`, `authorizeSessionTopic`, the
surface would grow one method per topic class. It doesn't — `broadcast(topic)` and
`canSubscribe(topic)` are the single parameterized interfaces that absorb new use-cases. The public
surface stays flat at 5 while events and topics multiply. **Passes.**

## 5. Key Collapses

1. **12 → 5 exports.** The 7 leaf DI reader/row types (`Realtime{Thread,User,OrgTeam,Task}Reader` +
   `Realtime{Thread,User,TeamMembers}Row`) collapse into the single `SubscribeAuthorizerDeps` bundle
   and become file-internal — the biggest reduction, and it removes the "one exported type per
   upstream read" sprawl that inflated the count from a 4-export real product to 12.
2. **16 imperative event handlers → 1 declarative route table** (INSIDE): `start()` stops growing an
   `unsubN` variable per event.
3. **Nothing to consolidate away** — the two retained real capabilities (`WsBroadcaster`,
   `createDbSubscribeAuthorizer`) are the irreducible fan-out + doorman product and stay standalone.
