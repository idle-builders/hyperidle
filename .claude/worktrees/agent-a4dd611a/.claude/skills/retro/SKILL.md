---
name: retro
description: "Collect observations from all sources after a story or pipeline run. Observe, don't fix."
argument-hint: "[story-id, 'last-session', or 'pipeline']"
user-invocable: true
---

# Retro

**Why:** Without recording what went well and what didn't, the same mistakes repeat every story. The retro log feeds the compound agent which identifies patterns and proposes process improvements. Observations compound — a single friction point noted three times becomes an actionable change.

Collect insights about `$ARGUMENTS` from every available source:

1. **Pipeline progress** — read `.pipeline/progress.json` for attempts, step failures, blocked stories
2. **Git history** — `git log` for commits, reverts, fixups. How many commits? Any rework?
3. **Lore** — `grep -r @lore` in changed files for decisions and workarounds captured during implementation
4. **Test results** — any tests that were hard to write, kept failing, or had to be rewritten?
5. **Agent sessions** — spawn an **Explore agent** to scan recent conversation artifacts, task outputs, and any `.pipeline/logs/` for errors, retries, permission denials, timeouts, and context compaction events

Append observations to `.pipeline/retro-log.jsonl` as one JSON line each:

```json
{"date": "2026-04-15", "story": "A1", "type": "friction|failure|gap|success|escalation", "observation": "specific sentence", "severity": "low|medium|high|critical", "tags": ["consistent", "tags"]}
```

Record successes too — they confirm what's working. If something is actively broken and will break the next story, record it as `escalation` with `critical` severity and output a warning.

**Rules:**
- Observe, don't fix — recording is your job, changing process is the compound agent's job
- Be specific — "tests were hard" is useless; "FK constraint test needed pragma setup not documented anywhere" is actionable
- One observation per line — don't bundle multiple issues
- Tag consistently — check existing tags in the retro log and reuse them
- Record successes — they protect working practices from being removed in future optimization
- Escalate rarely — only for things actively broken that will definitely break the next story
