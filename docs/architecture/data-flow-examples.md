# Data Flow Examples

Five end-to-end flows, verified against live code. Each names the real mechanism (service, table, column) that carries the step. Lifecycle semantics belong to the owning docs — task/session lifecycle in [tasks-and-sessions](../process-layer/tasks-and-sessions.md), knowledge nesting and promotion in [knowledge-architecture](../knowledge-architecture/index.md).

## 1. A Task Tree Completes

```
1. Builder agent completes the final leaf subtask → session ends, subtask → "done"
2. Dependency watcher (layers/core-api/work/src/dependency-watcher.ts):
   checks siblings — all children of parent task are done
3. Lifecycle propagation (layers/core-api/policy/src/lifecycle-propagation.ts):
   parent task → "review" (CAS-guarded, audited)
4. Propagation walks up: if root task's all children are terminal → root → "review"
5. task.changed is an ObjectChangeEvent — every subscription matching the
   task in reach (global + its team + its own) fires
   (registerSubscriptionFire, layers/core-api/user/src/subscription-fire.ts)
6. Product Manager's subscription adds an inbox row; a live nudge surfaces it
7. Product Manager opens the task's thread, reads the summary, posts a
   verdict-typed message
8. Verdict recorded → task state → "done"
9. post-task-retro plugin subscription fires on task.changed; its own prompt
   stops unless the change moved a root task to done AND it is a root task
   (plugins/document-management/plugin.json)
10. Document Librarian writes retro; learnings route to the
    facilitator and the assistant's thread
```

## 2. An Agent Gets Stuck

```
1. Builder agent hits a question it can't resolve → sends a message in its
   task thread ("Stripe webhook keys missing")
2. thread.message is an ObjectChangeEvent — every subscription matching the
   thread in reach fires (registerSubscriptionFire)
3. CPO's subscription adds an inbox row; a live nudge surfaces it
4. CPO opens thread on phone, replies with the key location
5. Reply lands in the Builder's thread
6. Builder starts new session, reads reply, continues
```

## 3. A Team Learns Something (the contribution loop)

The tree and its statuses are owned by [the-canonical-store](../knowledge-architecture/the-canonical-store.md); the curation subscriptions by [Knowledge Movement](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md).

```
1. A Builder discovers chunked upload >10MB works better
2. Builder logs the finding to task notes at session end (before compaction)
3. The Builder (or, later, the librarian agent's post-task-retro subscription)
   creates a document with edit_document, nested under the team's tree:
   "chunked upload for files >10MB"
   (status: proposed)
4. Nobody has judged it yet → doesn't surface to a human as active
5. Two weeks later, a Builder on another team independently discovers
   the same thing and writes their own document
6. The librarian's weekly document-triage subscription reads the proposed
   document, judges it a genuine reusable pattern, and promotes it → active
7. The document is now active, nested where it was written
8. Next time any Builder starts a task session:
   a. Context assembly scores every document the Builder's team can see
      against the task description
   b. This document matches the task type → included in the TOON pack
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
5. Product Manager edits the task via `edit_task`:
   - Revised doneCondition: adjust acceptance criteria for the
     due-diligence flow
   - Reasoning: recorded as a `changes` row
6. Product Manager creates Item: task revision review thread
   (kind: review, risk_tier: high)
7. Router → Conversations + push notification → both founders (strategic)
8. Founders discuss in the thread, approve with comments
9. Verdict recorded; team adjusts the subtask graph accordingly
   (internal, no additional human review unless the Product Manager
   judges it necessary)
```

## 5. A Sleep-Time Subscription Runs

```
1. Brand Voice agent has a schedule subscription: cron "every 6 hours",
   prompt "summarize new copy artifacts into memory"
2. The subscription clock finds it due, advances its next_run_at, and
   wakes the agent the same way an event subscription would
3. Model tier selected: fast (tiers: reasoning | workhorse | fast —
   see ../agent-layer/model-routing-and-cost.md)
4. Session starts, agent queries for new copy artifacts since the last run
5. Agent summarizes patterns into its own private memory (user scope)
   ("we shifted to a more formal tone this week") — nothing about the
   run is inherently silent; it produces no thread message only because
   its prompt asks for none
6. Session ends → session_ended event
7. No Item created, no thread, no notification
8. Next time the Brand Voice agent reviews copy in a task session,
   its context pack includes the updated memory — it's current
   without anyone having pushed an update
```
