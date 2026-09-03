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
agent, minutes apart. The cause is simpler than the harness research suggests: cursor-agent's
`returnEnforcementChannel` is `"none"`. **No enforcement artifact is written for it at all** — its
turns are held only by the drain-end gate, which observes and reports but cannot re-prompt. So
whether a cursor session hands its work back is entirely the model's own choice that run.

A channel called `"settings-cursor"` existed briefly on BA2's branch, added so the interception
installer could write `.cursor/hooks.json`. That installer was deleted with interception and the
channel with it, back to the `"none"` it has on main. Building cursor's enforcement means writing a
hook cursor actually honours — and the research's finding still stands as a trap: cursor voids its
whole hooks file when the matcher is written the way its own documentation shows.

### Not in this

- The review loop itself. BA2 shipped; it works on claude-code end to end.
- Anything about what an agent chooses to ask about.

### How it should be proved

Against the real binaries, repeatedly — a harness that returns four times out of five is not fixed.
Both harnesses already have integration lanes that spawn the real CLI.
