## 7. Data Flow Examples

### 7.1 A Bet Ships

```
1. Builder agent completes final task → session ends, task → "done"
2. Dependency Watcher: all tasks for Bet-17 are done
3. Product Manager's routine fires: "check bet done condition"
4. Product Manager confirms done condition met
5. Product Manager creates Item: bet review thread
   (kind: review, risk_tier: high, body: summary of what shipped)
6. Router: risk_tier ≥ medium → Conversations + push notification
7. Router: product scope → route to CPO
8. Notification Adapter: push to CPO's phone
9. CPO opens thread, reads summary, approves
10. Response recorded → bet status → "shipped"
11. Retro routine fires on Product Manager
12. Product Manager writes retro, routes to Practice + assistant thread
```

### 7.2 An Agent Gets Stuck

```
1. Builder agent hits a question it can't resolve → creates a chat thread Item
   (kind: chat, flagged_urgent: true, body: "Stripe webhook keys missing")
2. Router: chat + urgent → Conversations + push notification
3. Router: technical scope → route to CPO
4. CPO opens thread on phone, replies with the key location
5. Response → message delivered to Builder's inbox
6. Builder starts new session, reads reply, continues
```

### 7.3 A Practice Learns Something (the contribution loop)

```
1. Nimmly Builder discovers chunked upload >10MB works better
2. Builder logs finding to task notes at session end (before context compaction)
3. At next practice meeting (weekly routine on Build Practice Facilitator):
   a. Facilitator collects findings from all Builders across all products
      (each Builder contributes findings accumulated since the last meeting)
   b. Builders and Facilitator discuss — is this worth keeping?
   c. Facilitator creates practice item: "chunked upload for files >10MB"
      (status: CAPTURED, attention_score computed)
4. Score is moderate → doesn't surface to human in Knowledge view immediately
5. Two weeks later, Ambrovia Builder independently discovers the same thing
6. At next practice meeting, Facilitator: repetition signal → promotes to VALIDATED
7. Practice item is now ACTIVE and available in L3
8. Next time any Builder starts a task session:
   a. L0 Session Builder queries L3 for relevant patterns
   b. This pattern matches the task type → included in the TOON pack
   c. The Builder has the knowledge without anyone pushing a notification
```

### 7.4 A Bet Changes Mid-Flight

```
1. Nimmly team is two weeks into a 6-week bet
2. Growth Agent discovers via analytics that the target audience uses
   the product differently than hypothesized
3. Growth Agent posts finding to task notes + contributes to next practice meeting
4. Product Manager notices the trajectory has shifted:
   the hypothesis is no longer valid
5. Product Manager drafts a bet revision:
   - New hypothesis: "SME buyers use the comparison tool for due diligence,
     not initial screening"
   - Revised done condition: adjust acceptance criteria for due-diligence flow
   - Reasoning: cites the Growth Agent's analytics data
6. Product Manager creates Item: bet revision review thread
   (kind: review, risk_tier: high)
7. Router → Conversations + push notification → both founders (strategic)
8. Founders discuss in the thread, approve with comments
9. Response recorded → bet.revision_log appended → hypothesis and done_condition updated
10. Team adjusts task graph accordingly (internal, no additional human review
    unless the Product Manager's judgement says otherwise)
```

### 7.5 A Sleep-Time Routine Runs

```
1. Brand Voice agent has a silent routine: "every 6 hours, summarize
   new copy artifacts across all products into memory"
2. Scheduler fires the routine (silent: true)
3. Model tier selected: Fast (sleep-time routine)
4. Session starts, agent queries for new copy artifacts since last run
5. Agent summarizes patterns into its own L2 memory
   ("Nimmly shifted to more formal tone this week; Ambrovia added humor")
6. Session ends → session_ended event → cost logged
7. No Item created, no thread, no notification
8. Next time Brand Voice agent reviews copy in a task session,
   its L0 context pack includes the updated memory — it's current
   without anyone having pushed an update
```

### 7.6 Cross-Team Work

```
1. Nimmly Product Manager's bet needs a new billing webhook
2. Nimmly PF opens a chat thread to Platform Team lead:
   "We need a billing webhook for subscription changes.
    Appetite: 3 days of Platform work."
3. Platform lead agrees → creates a cross-team task on Nimmly's bet
   (owner: Platform Builder, cross_team: true)
4. Platform Builder starts sessions on the task, works it in Platform's rhythm
5. Task completes → artifact ready → task → "done"
6. Nimmly bet's dependency resolves → Nimmly team continues
7. Cross-team task is visible in Nimmly's bet thread and in the Rail <!-- @lore AD8a: historical — Rail removed in U6 -->
```

---
