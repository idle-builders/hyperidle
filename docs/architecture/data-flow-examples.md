# Data Flow Examples

Five end-to-end flows, verified against live code. Each names the real mechanism (service, table, column) that carries the step. Lifecycle semantics belong to the owning docs — task/session lifecycle in [tasks-and-sessions](../process-layer/tasks-and-sessions.md), knowledge nesting and promotion in [knowledge-architecture](../knowledge-architecture/index.md), item routing in [items-and-routing](../human-interface-layer/items-and-routing.md).

## 1. A Task Tree Completes

```
1. Builder agent completes the final leaf subtask → session ends, subtask → "done"
2. Dependency watcher (layers/core-api/work/src/dependency-watcher.ts):
   checks siblings — all children of parent task are done
3. Lifecycle propagation (layers/core-api/policy/src/lifecycle-propagation.ts):
   parent task → "review" (CAS-guarded, audited)
4. Propagation walks up: if root task's all children are terminal → root → "review"
5. Product Manager confirms done condition met
6. Product Manager creates Item: task review thread
   (kind: review, risk_tier: high, body: summary of what shipped)
7. Router: risk_tier ≥ medium → Conversations + push notification
   (notification_queue + dispatcher)
8. Router: product scope → route to CPO
   (resolveReviewRecipients, layers/core-api/org/src/org-routing.ts)
9. Notification adapter: push to CPO's phone
10. CPO opens thread, reads summary, approves
11. Verdict recorded → task state → "done"
12. post-task-retro plugin routine fires on task_state_changed → done
    (plugins/knowledge-management/plugin.json)
13. Knowledge Librarian writes retro; learnings route to the
    facilitator and the assistant's thread
```

## 2. An Agent Gets Stuck

```
1. Builder agent hits a question it can't resolve → creates a chat thread Item
   (kind: chat, blocking: true, body: "Stripe webhook keys missing")
2. Router: chat + blocking → Conversations + push notification
   (urgency carried by notification_queue.severity)
3. Router: technical scope → route to CPO
4. CPO opens thread on phone, replies with the key location
5. Reply lands in the Builder's thread
6. Builder starts new session, reads reply, continues
```

## 3. A Team Learns Something (the contribution loop)

The tree and its statuses are owned by [the-canonical-store](../knowledge-architecture/the-canonical-store.md); the promotion loop by [facilitators](../knowledge-architecture/facilitators.md).

```
1. A Builder discovers chunked upload >10MB works better
2. Builder logs the finding to task notes at session end (before compaction)
3. A facilitator collects the finding and creates a knowledge item,
   nested under its practice's folder:
   "chunked upload for files >10MB"
   (status: proposed, attention_score computed)
4. Score is moderate → doesn't surface to a human in the Knowledge view yet
5. Two weeks later, a Builder on another team independently discovers
   the same thing
6. The promotion pipeline's repetition signal promotes it → active
7. The item is now active, nested under its practice
8. Next time any Builder starts a task session:
   a. Context assembly queries that practice's folder for relevant patterns
   b. This pattern matches the task type → included in the TOON pack
   c. The Builder has the knowledge without anyone pushing a notification
```

## 4. A Task Changes Mid-Flight

```
1. The team is two weeks into an active task
2. Growth agent discovers via analytics that the target audience uses
   the product differently than assumed
3. Growth agent posts the finding to task notes, and the facilitator
   picks it up for the practice
4. Product Manager notices the direction has shifted:
   the done condition is no longer valid
5. Product Manager edits the task via PATCH /api/tasks/:id:
   - Revised doneCondition: adjust acceptance criteria for the
     due-diligence flow
   - Reasoning: appended to auditTrail
6. Product Manager creates Item: task revision review thread
   (kind: review, risk_tier: high)
7. Router → Conversations + push notification → both founders (strategic)
8. Founders discuss in the thread, approve with comments
9. Verdict recorded; team adjusts the subtask graph accordingly
   (internal, no additional human review unless the Product Manager
   judges it necessary)
```

## 5. A Sleep-Time Routine Runs

```
1. Brand Voice agent has a silent routine (routines.silent = true):
   "every 6 hours, summarize new copy artifacts into memory"
2. Scheduler fires the routine
3. Model tier selected: fast (tiers: reasoning | workhorse | fast —
   see ../agent-layer/model-routing-and-cost.md)
4. Session starts, agent queries for new copy artifacts since the last run
5. Agent summarizes patterns into its own private memory (user scope)
   ("we shifted to a more formal tone this week")
6. Session ends → session_ended event
7. No Item created, no thread, no notification
8. Next time the Brand Voice agent reviews copy in a task session,
   its context pack includes the updated memory — it's current
   without anyone having pushed an update
```
