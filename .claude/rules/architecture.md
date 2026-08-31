# Architecture rules

## Harness features are file-based, and every harness has its own

**Harness capabilities — hooks, skills, agent instructions, permissions, MCP wiring — are almost always
configured through files the harness reads, not through CLI flags.** An absent command-line flag is not
evidence that a feature is missing; the feature is usually a file in a location the harness looks for.

**Every harness must be researched and implemented on its own terms.** Its file locations, its event
names, its payload shape, and its response protocol. A design that works on one harness and is copied to
the others is worse than no design, because it fails silently: the file is written, nothing errors, and
the feature simply never runs.

**An architecture that touches a harness must be exact.** For each harness it must name the actual file
path, the actual event or key vocabulary, the actual payload, and the actual response contract that
harness expects — with the evidence it was verified against the installed binary, not inferred from
another harness or from documentation alone.

**How to find the contract.** Read the harness's own installed bundle. The binary on `PATH` is often a
launcher — resolve it (`realpath`, `file`), then grep the installed JavaScript (or `strings` a compiled
binary) for its config filenames and event vocabulary. Then prove it with a real run: the bundle tells
you the vocabulary, only a run proves the behaviour.

### The learning that earned this rule

An action-gate was built across four harnesses by writing Claude Code's `PreToolUse` hook shape into all
four — `.claude/settings.json`, `.codex-home/hooks.json`, `.cursor/hooks.json`, and an opencode plugin.
Only Claude's leg worked. The others wrote files their harness never reads, and the failures were read as
harness limitations: "cursor-agent ignores hooks", "codex fires the hook but returns empty completions",
"opencode is scoped out". One of those was nearly accepted as a permanent product limit.

cursor-agent's real contract, recovered from its installed bundle in minutes: config at
`<project>/.cursor/hooks.json` (with user and enterprise levels above it), its own events
(`beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeSubmitPrompt`,
`stop`), the shape `{ "beforeShellExecution": [ { "command": "/path" } ] }`, and a deny protocol where
the script returns `{"permission":"deny","user_message":"..."}`. Nothing about it resembles Claude's
nested `hooks.PreToolUse[].matcher`, and `user_message` is precisely the field that carries the reason
back to the model — the capability that had been written off as impossible on that harness.
