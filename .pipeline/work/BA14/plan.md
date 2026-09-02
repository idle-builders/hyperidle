# BA14 — a team's repository never reaches the agent's sandbox

## What we need

When someone sets up a workspace and points it at a git repository, the agents on that team should
work in that repository. They do not. Every session runs in an empty directory with only HyperIdle's
own scaffolding in it, and the agent discovers there is nothing there.

**Why it matters.** It is the first thing anyone does — the setup screen asks for a project folder —
and it silently does not work. An agent asked to change a file reports that the file does not exist.

### What success looks like

A team with a code filesystem gets sessions whose working directory contains that repository's
content, and a commit an agent makes there reaches the real repository.

### The evidence we already have

From a BA2 proof run. Onboarding was given `/tmp/ba2-proof-repo`, a real git repository with two
committed files. The filesystem row was created and reachable:

```
{"kind":"code","resourceRef":{"kind":"code","repo":"/tmp/ba2-proof-repo","branch":"main"},
 "state":"reachable"}
```

The agent's session then ran in a directory containing only `.claude/`, `.fabric/`, `.mcp.json`,
`AGENTS.md`, `CLAUDE.md`, `context/` and `work/` — a git repository with **no commits**. Asked to
delete a file that exists in the real repository, the agent searched the whole tree and correctly
reported it was not there.

Nothing logged a mount, and nothing failed loudly. The provisioner has a filesystem-mounting phase and
a `mounter` port that is optional — "when absent, sessions run without any filesystem mount (degrade
to today's behavior)" — which is the shape a silent no-op takes.

### Not in this

- Writeback policy, branch strategy, or what happens to a commit an agent makes.
- Anything about which repository a team should have.

### How it should be proved

Set a team's project folder to a repository with a known file in it, dispatch a task, and have the
agent read that file.
