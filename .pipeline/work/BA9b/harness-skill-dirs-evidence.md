# Where each harness actually reads skills from

Established empirically on 2026-08-26 by running the **real installed binaries**, not from
documentation, blog posts, or the directory names.

## Method

Four skills, one per candidate directory, each with a distinct name so the answer is unambiguous:

```
.claude/skills/probe-claudedir/SKILL.md
.opencode/skills/probe-opencodedir/SKILL.md
.codex-home/skills/probe-codexhomedir/SKILL.md
.agents/skills/probe-agentsdir/SKILL.md
```

Each harness was then run non-interactively from that directory and asked to list the skills available
to it. Which probe names came back tells you which directories it scans — a harness cannot name a skill
it never discovered.

Invocations used: `claude -p "…"`, `opencode run "…"`, `codex exec --skip-git-repo-check "…"`,
`cursor-agent -p --trust "…"`.

## Result

| Harness | Probe skills visible | Directories it scans |
|---|---|---|
| `claude` | `probe-claudedir` | `.claude/skills` |
| `opencode` | `probe-claudedir`, `probe-opencodedir`, `probe-agentsdir` | `.claude/skills`, `.opencode/skills`, `.agents/skills` |
| `codex` | `probe-agentsdir` | `.agents/skills` |
| `cursor-agent` | `probe-claudedir`, `probe-agentsdir` | `.claude/skills`, `.agents/skills` |

## What follows

- **Nothing reads `.codex-home/skills`.** `.codex-home` is Codex's *config* directory — this repo's own
  comment says so (`layers/agent-execution/harness-registry/src/adapter-pool.ts:334`: "codex reads MCP
  server from .codex-home/config.toml"), and `codex plugin --help` shows Codex manages plugins through
  `~/.codex/config.toml` and a marketplace cache. Writing skills there produces dead files.
- **`.agents/skills` is the only directory Codex reads**, and it was absent from the implementation. As
  written, Codex received no skills at all.
- **Two directories cover all four harnesses: `.claude/skills` and `.agents/skills`.**
  `.opencode/skills` is redundant, since opencode also reads `.claude/skills`.
- `.agents` is not currently in `SANDBOX_SCAFFOLDING_PATHS`
  (`layers/agent-orchestration/run-orchestration/src/scaffolding-paths.ts`) and has to be added.

## Why this is recorded rather than left to be re-derived

The first implementation chose three directories by name — one right, one redundant, one dead — and the
one harness that needed a fourth got nothing. The unit tests passed, because they asserted that the
writer matched the constant the same author had defined. Only running the binaries settles it.

Re-run this probe if a harness is added or upgraded; skill discovery is the harness's behaviour, not
ours, and it can change under us.
