---
name: retro
description: "Collect observations from all sources after a workpackage or pipeline run. Observe, don't fix."
argument-hint: "[workpackage-id, 'last-session', or 'pipeline']"
user-invocable: true
min_tool_calls: 8
---

# Retro

**Why:** Without recording what went well and what didn't, the same mistakes repeat every workpackage. The retro log feeds `/compound` which identifies patterns and proposes process improvements. Observations compound — a single friction point noted three times becomes an actionable change.

Collect insights about `<target>` from every available source:

1. **Pipeline progress** — read `.pipeline/progress.json` for attempts, step failures, blocked workpackages
2. **Git history** — `git log` for commits, reverts, fixups. How many commits? Any rework?
3. **Lore** — `grep -r @lore` in changed files for decisions and workarounds captured during implementation
4. **Test results** — any tests that were hard to write, kept failing, or had to be rewritten?
5. **Agent sessions** — spawn an **Explore agent** to scan recent conversation artifacts, task outputs, and any `.pipeline/logs/` for errors, retries, permission denials, timeouts, and context compaction events

**Before adding a `compoundCandidates` field**, check `.claude/process/compound-candidates.md` for existing candidate IDs. If a friction matches an existing CONFIRMED candidate, reference its ID (e.g. `"CC-002"`) instead of restating the issue. If the candidate is `RESOLVED` but the friction is back, change its status in the tracker to `RECURRED` and note which fix didn't stick. Only invent new free-text candidates for frictions with no matching tracker row.

Append observations to `.pipeline/retro-log.jsonl` as one JSON line each:

```json
{"date": "2026-04-15", "workpackage": "A1", "type": "friction|failure|gap|success|escalation", "observation": "specific sentence", "severity": "low|medium|high|critical", "tags": ["consistent", "tags"]}
```

Record successes too — they confirm what's working. If something is actively broken and will break the next workpackage, record it as `escalation` with `critical` severity and output a warning.

**Rules:**
- Observe, don't fix — recording is your job, changing process is `/compound`'s job
- Be specific — "tests were hard" is useless; "FK constraint test needed pragma setup not documented anywhere" is actionable
- One observation per line — don't bundle multiple issues
- Tag consistently — check existing tags in the retro log and reuse them
- Record successes — they protect working practices from being removed in future optimization
- Escalate rarely — only for things actively broken that will definitely break the next workpackage

## Target

$ARGUMENTS
