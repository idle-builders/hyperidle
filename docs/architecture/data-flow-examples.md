# Data Flow Examples

Five end-to-end flows, verified against live code. Each names the real mechanism (service, table, column) that carries the step. Lifecycle semantics belong to the owning docs — bet lifecycle in [bets-shape-commit-change-ship](../process-layer/bets-shape-commit-change-ship.md), task/session lifecycle in [tasks-and-sessions](../process-layer/tasks-and-sessions.md), knowledge layers and promotion in [knowledge-architecture](../knowledge-architecture/index.md), item routing in [items-and-routing](../human-interface-layer/items-and-routing.md).

## 1. A Bet Ships

```
1. Builder agent completes final task → session ends, task → "done"
2. Dependency watcher (packages/server/src/services/dependency-watcher.ts):
   all tasks for Bet-17 are done
3. Product Manager's routine fires: "check bet done condition"
4. Product Manager confirms done condition met
5. Product Manager creates Item: bet review thread
   (kind: review, risk_tier: high, body: summary of what shipped)
6. Router: risk_tier ≥ medium → Conversations + push notification
   (notification_queue + dispatcher)
7. Router: product scope → route to CPO
   (routeToFounder, packages/server/src/services/founder-router.ts)
8. Notification adapter: push to CPO's phone
9. CPO opens thread, reads summary, approves
10. Verdict recorded → bet status → "completed"
11. builtin:post-bet-retro routine fires on the Product Manager
12. Product Manager writes the retro; learnings route to the
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

Layer taxonomy (L0–L4) and knowledge statuses are owned by [the-five-layers](../knowledge-architecture/the-five-layers.md); the promotion loop by [facilitators](../knowledge-architecture/facilitators.md).

```
1. A Builder discovers chunked upload >10MB works better
2. Builder logs the finding to task notes at session end (before compaction)
3. At the next weekly practice-meeting routine (facilitator role,
   packages/server/src/services/practice-meeting.ts):
   a. Facilitator collects findings from all Builders
   b. Builders and facilitator discuss — is this worth keeping?
   c. Facilitator creates knowledge item: "chunked upload for files >10MB"
      (status: captured, attention_score computed)
4. Score is moderate → doesn't surface to a human in the Knowledge view yet
5. Two weeks later, a Builder on another team independently discovers
   the same thing
6. At the next meeting, the promotion pipeline's repetition signal
   promotes it → validated
7. The item is now active in L3
8. Next time any Builder starts a task session:
   a. Context assembly queries L3 for relevant patterns
   b. This pattern matches the task type → included in the TOON pack
   c. The Builder has the knowledge without anyone pushing a notification
```

## 4. A Bet Changes Mid-Flight

```
1. The team is two weeks into an active bet
2. Growth agent discovers via analytics that the target audience uses
   the product differently than hypothesized
3. Growth agent posts the finding to task notes + contributes it to the
   next practice meeting
4. Product Manager notices the trajectory has shifted:
   the hypothesis is no longer valid
5. Product Manager drafts a bet revision:
   - New hypothesis: "SME buyers use the comparison tool for due diligence,
     not initial screening"
   - Revised done condition: adjust acceptance criteria for the
     due-diligence flow
   - Reasoning: cites the growth agent's analytics data
6. Product Manager creates Item: bet revision review thread
   (kind: review, risk_tier: high)
7. Router → Conversations + push notification → both founders (strategic)
8. Founders discuss in the thread, approve with comments
9. Verdict recorded → bets.revision_log appended → hypothesis and
   done_condition updated
10. Team adjusts the task graph accordingly (internal, no additional human
    review unless the Product Manager's judgement says otherwise)
```

## 5. A Sleep-Time Routine Runs

```
1. Brand Voice agent has a silent routine (routines.silent = true):
   "every 6 hours, summarize new copy artifacts into memory"
2. Scheduler fires the routine
3. Model tier selected: fast (tiers: reasoning | workhorse | fast —
   see ../agent-layer/model-routing-and-cost.md)
4. Session starts, agent queries for new copy artifacts since the last run
5. Agent summarizes patterns into its own L2 memory
   ("we shifted to a more formal tone this week")
6. Session ends → session_ended event → cost logged
7. No Item created, no thread, no notification
8. Next time the Brand Voice agent reviews copy in a task session,
   its context pack includes the updated memory — it's current
   without anyone having pushed an update
```
