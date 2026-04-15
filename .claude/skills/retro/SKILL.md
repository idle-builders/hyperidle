---
name: retro
description: "Use after a story or pipeline run to contribute observations to the retro log. Triggers: post-implementation, pipeline session complete, any agent finishing work."
argument-hint: "[story-id, 'last-session', or 'pipeline']"
user-invocable: true
allowed-tools: Read Write Grep Glob Bash
---

# Retro — Contribute Observations

You are contributing observations from: **$ARGUMENTS**

This is a lightweight step. You do NOT change skills. You do NOT change process. You observe and record. The compound agent reviews the retro log separately and decides when accumulated evidence warrants a change.

---

## Step 1 — Gather evidence

Collect the raw facts about what happened:

- **Git log:** What was committed? How many commits? Any reverts or fixups?
- **Attempts:** How many tries did this story/task take? Check `.pipeline/progress.json`.
- **Session logs:** Scan `.pipeline/logs/` for errors, retries, permission denials, timeouts.
- **Test results:** Any tests that were hard to write, kept failing, or had to be rewritten?
- **Blockers:** Was anything blocked? Why? Was human input needed?

---

## Step 2 — Record observations

Append to `.pipeline/retro-log.jsonl` (create if it doesn't exist). Each observation is one JSON line:

```json
{"date": "2026-04-15", "story": "A1", "type": "friction", "observation": "Planning step missed that the API route needed auth middleware — caused a rework cycle in implementation", "severity": "medium", "tags": ["planning", "auth", "rework"]}
```

Fields:
- **date**: ISO date
- **story**: story ID or "pipeline" or "session-N"
- **type**: one of `friction` (slowed work), `failure` (caused a retry/block), `gap` (missing instruction/skill), `success` (something worked well — worth preserving), `escalation` (needs human attention now)
- **observation**: One clear sentence. What happened and why. Be specific — name the skill, the step, the file, the error.
- **severity**: `low` (minor annoyance), `medium` (caused rework), `high` (caused a block or failure), `critical` (broke the pipeline)
- **tags**: Short labels for pattern matching. Use consistent terms across retros so the compound agent can group them.

Record **every** notable observation, not just problems. Successes matter too — they confirm what's working and shouldn't be changed.

---

## Step 3 — Flag escalations

If you observed something that is **actively broken right now** and will break the next story too:

1. Record it with `"type": "escalation"` and `"severity": "critical"`.
2. Output a clear warning to the coordinator:

```
⚠️ ESCALATION: [one-line summary]
Evidence: [what happened]
Impact: [what will break next if this isn't fixed]
Suggested fix: [specific change needed]
```

The coordinator (pipeline orchestrator or human) decides whether to act immediately. The retro itself does NOT make the change.

---

## Rules

- **Observe, don't fix.** Your job is to record what happened, not to change skills or process. That's the compound agent's job.
- **Be specific.** "Tests were hard" is useless. "Test for API route /agents/:id required mocking the queue service which isn't documented anywhere" is actionable.
- **One observation per line.** Don't bundle multiple issues into one entry.
- **Tag consistently.** Check existing tags in the retro log and reuse them. New tags fragment pattern detection.
- **Record successes.** If the planning step prevented a rework that would have happened before, record that. It protects the step from being removed in a future optimization.
- **Escalate rarely.** Only for things that are actively broken and will definitely break the next story. Everything else compounds through the normal review cycle.
