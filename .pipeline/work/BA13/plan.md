# BA13 — opencode and cursor cannot be made to return

## What we need

Two of the four harnesses cannot be relied on to hand their work back, so an agent running on them
can finish a task and tell nobody. On opencode it never happens at all; on cursor-agent it happens
some runs and not others.

**Why it matters.** Every other mechanism rides on the return: BA2's review loop, the never-silent
net, a task moving to done. A harness that cannot be forced to return is a harness where work
silently evaporates.

### What success looks like

An agent on opencode and an agent on cursor-agent both end every turn by calling one of the return
actions, the same way claude-code does, proved by running each of them repeatedly against the real
binary and seeing the work land.

### The evidence we already have

**opencode.** Its own log names it, from a real BA2 run:

```
level=ERROR message="failed to load plugin"
path=.../.opencode/plugins/return-signal.ts error="Plugin export is not a function"
```

`provisionReturnHook` writes a plugin that default-exports an OBJECT with a `setup(ctx)` method and
calls `ctx.on("session.idle", …)` and `ctx.sendMessage(…)`. The installed opencode's own typings say a
plugin is a FUNCTION: `Plugin = (input: PluginInput, options?) => Promise<Hooks>`, where `Hooks` has
`event?: ({event}) => Promise<void>` and the input carries the opencode SDK `client`. None of `setup`,
`ctx.on` or `ctx.sendMessage` exists. The plugin has therefore never loaded, and every opencode
session in the BA2 runs crashed without returning anything — no thread, no notice, nothing for a human
to see.

**cursor-agent.** Files a review on some runs and simply stops on others; the same task, the same
agent, minutes apart. Its forcing is `.cursor/hooks.json`, which the BA2 harness research recorded as
being voided wholesale when the matcher is written the way cursor's own documentation shows.

### Not in this

- The review loop itself. BA2 shipped; it works on claude-code end to end.
- Anything about what an agent chooses to ask about.

### How it should be proved

Against the real binaries, repeatedly — a harness that returns four times out of five is not fixed.
Both harnesses already have integration lanes that spawn the real CLI.
