# Agent ↔ Human Reach Parity Audit

Base: `origin/main` @ `08090196d`. Method: enumerated all 135 HTTP routes in
`layers/core-api/src/routes/` + `layers/agent-orchestration/src/routes/`, all 22 agent
tools in `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`, every route
the agent seam dials (`layers/agent-orchestration/src/services/core-api-port-composition.ts`),
and every `/api/...` path the web UI calls (`layers/core-ui/src`). Then traced each
capability from both ends.

## The good news first

The write seam is right. Every one of the 22 agent tools goes through `ports.coreApi`,
and `buildCoreApiPort` is a Hono `hc` client that issues **real HTTP requests to the same
routes the browser calls**. There is no second data path, no direct-DB back door for
agents. Authentication is unified too: the agent's identity rides the
`x-hyperidle-actor-id` header and lands as `c.get("userId")` exactly like a human's — the
same authz stack, the same `users` row, no `kind === 'ai'` branch in any write guard.

So the architecture supports the core idea. The gaps below are all about *what got wired
to which door*, not about the doors themselves.

---

## 1. Human can reach it, agent cannot

No agent tool exists for any of these. The route exists; the agent has no way to call it.

**Work lifecycle**
| Capability | Route | Agent tool |
|---|---|---|
| Commit a bet | `POST /bets/:id/commit` | — |
| Kill a bet | `POST /bets/:id/kill` | — |
| Record a bet retro | `POST /bets/:id/retro` | — |
| Edit a team | `PATCH /teams/:teamId` | only inside `create_team` |

**Routines** — agents can create and update, not run or remove.
| Trigger a routine now | `POST /routines/:id/trigger` | — |
| Delete a routine | `DELETE /routines/:id` | — |

**Roster and org**
| Create an agent (choosing harness + model) | `POST /agents` | — (see §3.2) |
| Edit an agent | `PATCH /agents/:id` | — |
| Delete an agent | `DELETE /agents/:id` | — |
| Edit a person's profile | `PATCH /users/:id` | — |
| Edit the assistant's persona | `PATCH /users/:id/assistant` | — |
| Add / remove an org edge | `PUT /org/edges`, `DELETE /org/edges/:id` | — |

**Knowledge**
| Archive an item | `POST /knowledge/:id/archive` | — (agent uses a different route, §3.3) |
| Change an item's scope | `PATCH /knowledge/:id/scope` | — |

**Conversation**
| Record a verdict | `POST /threads/:id/messages` type `verdict` | — (founder-only by design) |
| Rename / patch a thread | `PATCH /threads/:id` | — |

**Platform config** — credentials, connections, filesystems, plugins, harness redetect,
model gateway, agent-behavior settings, notifications, hints. All human-only. This is
defensible: it is the operator surface. Worth a deliberate ruling rather than an accident.

**The big one: agents cannot read.** Of 22 tools, exactly one reads — `query_practice`
(knowledge search). An agent has no way to list bets, open a task, read a thread, check
its inbox, list artifacts, look at the org chart, or see notifications. Everything it
knows arrives pre-baked in the prompt by `contextBundle`. A human opens the app and looks
around; an agent gets a briefing and cannot ask a follow-up question of the system.
That is the single largest asymmetry in the product.

**Role filtering narrows it further.** Of 16 agent roles, only `assistant` gets
`create_team`, `add_agent`, `create_bet`, `edit_bet`, `create_routine`, `update_routine`.
Only `assistant`/`facilitator`/`product_manager` get the knowledge lifecycle tools. The
other 13 roles (builder, designer, qa_engineer, …) have **10 tools**.

---

## 2. Agent can reach it, human cannot

Live routes with zero caller in the web UI.

| Capability | Route | Agent tool |
|---|---|---|
| Create a task | `POST /tasks` | `create_task` |
| Hand a task to another agent or a human | `POST /tasks/:id/handoff` | `handoff_to` |
| Append a task note | `PATCH /tasks/:id/notes` | `log_task` |
| Create an artifact | `POST /artifacts` | `create_artifact` |
| Create / update an item | `POST`,`PATCH /conversations/items` | `create_item` |
| Post a `review` message | `POST /threads/:id/messages` | `submit_review` |
| Transition knowledge status (guarded) | `POST /knowledge/:id/promote` | `promote_knowledge` |
| Merge two knowledge items | `POST /knowledge/:id/merge` | `merge_knowledge` |
| Split a knowledge item | `POST /knowledge/:id/split` | `split_knowledge` |
| Open a knowledge conflict | `POST /knowledge/:id/conflicts` | `create_conflict_review` |
| Read knowledge conflicts | `GET /knowledge/:id/conflicts` | — |
| Run a knowledge sweep | `POST /knowledge/sweep` | `run_knowledge_sweep` |
| Set / recompute attention score | `PATCH /knowledge/:id/attention-score`, `POST /knowledge/:id/recompute-attention` | `score_attention` |
| Create a team via the org door | `POST /org/teams` | `create_team` |
| Scaffold a roster | `POST /org/scaffold-request` | `create_team`, `add_agent` |

Two of these deserve their own line.

**Nobody can create a task in the app.** There is no "new task" control anywhere in
`core-ui`. The UI only ever reads `GET /api/tasks?ids=`. Tasks exist only because an agent
made one.

**Knowledge conflicts are completely invisible to humans.** `create_conflict_review`'s
own description says it routes "to the relevant facilitator's queue" — the facilitator is
an *agent*. No page reads `GET /knowledge/:id/conflicts`. A human cannot see that a
conflict exists, let alone resolve it.

**Message types split by actor.** The UI can post only `plain` and `verdict`. Agents post
only `plain` and `review`. Neither can author what the other authors.

---

## 3. Same capability, two implementations — the flags

These are the ones you asked to have called out. Same concept, two code paths, different
rules.

### 3.1 Create a team

- **Human** → `POST /teams`: same-name idempotency guard, defaults `functions` to
  `["development","product"]`, resolves the roster with `resolveAgentScaffoldSpecs`,
  rejects with 400 if that yields zero agents, then inserts team + roster **in one
  transaction**.
- **Agent** (`create_team`) → `POST /org/teams` (bare insert, no idempotency, no functions
  default, no zero-spec guard) → then `POST /org/scaffold-request` → then
  `PATCH /teams/:teamId` to set the lead. Three calls, no transaction.

A team created by the assistant and a team created by clicking are not built the same way,
and only one of them can fail cleanly.

### 3.2 Create an agent

- **Human** → `POST /agents`: validates the (harness, provider, modelId) triple against
  the adapter pool (422 on mismatch), FK-checks `teamId` (422), derives `agentCategory`
  from the role catalog, writes the run config with the caller's chosen harness and model.
- **Agent** (`add_agent`) → `POST /org/scaffold-request`: resolves a persona from the
  catalog and persists. No harness choice, no model choice, no config validation.

### 3.3 Change a knowledge item's status — three writers

- **Human triage** (`KnowledgeList.tsx`) → `PATCH /knowledge/:id` with `status` → calls
  `updateKnowledgeItem` directly. **No transition guard.**
- **Human archive** (`KnowledgeDetail.tsx`) → `POST /knowledge/:id/archive` →
  `archiveKnowledgeItem`: no version bump, `editType:"archive"` log row, emits
  `knowledge_archived`.
- **Agent** (`promote_knowledge`) → `POST /knowledge/:id/promote` → `knowledgeTransition`,
  which **blocks promotion to `validated` while an open conflict exists**.

Three write paths, three different edit-log shapes, two different events, and one guard
that only the agent path honours. A human validating an item in Triage bypasses the
conflict check the agent cannot bypass. That is backwards from the intent.

### 3.4 Record a verdict — two routes, and the wrong one is wired

There are two verdict implementations in `layers/core-api/src/routes/threads.ts`:

| | `POST /threads/:id/messages` type `verdict` | `POST /threads/:tid/messages/:mid/verdict` |
|---|---|---|
| Authz | sender's role must be `founder`, no self-verdict | any thread participant (`authorizeWrite`) |
| Effect | appends the message, resolves the review, emits `thread_resolved` | transitions the proposed call to `granted`, composes the tailored grant, emits `proposed_call_granted` |
| Production callers | `ReviewPage.tsx` → `postVerdictHostMessage` | **none** |

The UI calls the first. The first contains, at `threads.ts:1534`:

```ts
const decision = input.payload.decision;
// AL7 trust-first: approve verdict handled by proposed-call workflow (Task 8).
void decision; // will be used by Task 8 implementation
```

So **approving an agent's proposed action in the app grants nothing.** The message
resolves; no grant is composed; no `proposed_call_granted` is emitted; the agent's session
is never re-provisioned to execute the approved call.

### 3.5 The whole review-gating path is inert in production

Following that thread down: the workflow router in `tool-registry.ts` (classify
reversibility → capture → route to review → consume grant) only activates when
`options.sessionWorkflow` is set. Grepping every production call site,
`sessionWorkflow` is **only ever supplied by tests**. It is never baked into a session
request (`session-requests/src/service.ts` bakes `transcript`, `contextBundle`,
`agentConfig`, `harnessDisabled`, `callingThreadId` — not `sessionWorkflow`), so no
production session ever runs under the router.

Consequences: `proposed_calls` rows are never captured in production; the three
`POST /reviews/proposed-calls*` routes are dead; and the human-in-the-loop broker that is
supposed to mediate agent reach does not run. Agents today call every tool directly.

Whether that is acceptable is an ETHOS call ("security is never preemptive"), but it
should be a *decision*, not the current state of a half-landed Task 8.

### 3.6 Dead / duplicated doors found along the way

- `POST /org/scaffolded-agents` — superseded by `/scaffold-request`, still mounted, no
  caller (only in the `hc` type mirror).
- `POST /threads/:tid/messages/:mid/verdict` — §3.4, no production caller.
- `POST /reviews/proposed-calls`, `/proposed-calls/consume`, `/proposed-calls/:id/outcome`
  — reachable only from the inert workflow router.
- `layers/core-api/src/routes/reviews.ts` ships a hardcoded `FIXTURE_REVIEW` returned for
  id `"rev-1"` from a production route. Fabricated data in production code.
- Scaffolding has three in-process call sites (`POST /users`, `POST /teams`,
  `POST /org/scaffold-request`) plus the dead HTTP route above.

---

## Scorecard

| | Count |
|---|---|
| HTTP routes | ~135 |
| Agent tools | 22 |
| Agent tools that read | 1 |
| Tools for a non-assistant, non-facilitator role | 10 |
| Domain capabilities a human has and an agent does not | 17 (+ the whole platform-config surface) |
| Capabilities an agent has and a human does not | 15 |
| Same-capability divergences | 4 |
| Dead / duplicate doors | 6 |

## What I'd fix, in order

1. **Wire or delete AL7.** Either bake `sessionWorkflow` into session requests and make
   the UI's verdict grant the call, or delete the router, the proposed-call routes, and
   the second verdict route. Right now the review gate reads as implemented and isn't.
2. **Collapse the four divergences.** One door per capability: team creation, agent
   creation, knowledge status transition, verdict. Whichever implementation has the
   guards wins; the other's callers move to it and it is deleted.
3. **Give agents a read surface.** A handful of read tools (`get_task`, `get_bet`,
   `read_thread`, `list_inbox`) close the largest asymmetry and remove the pressure to
   over-bake context.
4. **Decide the human-only and agent-only lists on purpose.** Bet lifecycle, routine
   trigger, roster edits, task creation, knowledge conflicts — for each, either build the
   missing side or write down why it is one-sided.
5. **Make it enforceable.** A governance-lint rule that fails when a route has neither a
   UI caller nor a tool, or when two routes write the same table through different
   service functions, would stop this drifting again.
