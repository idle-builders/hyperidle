# Harness research — `builtin`

**Researched by the orchestrator directly (it is in-repo, no external binary), 2026-08-25, at
`dc8d1cbd7` + this branch.**

## Verdict

**There is nothing to intercept, because the builtin harness has no session actions of the kind this
work package targets.** Every action it can take is a HyperIdle tool-registry call — exactly the
category the founder ruled out of scope (*"our MCP tool actions don't matter"*).

This is not a gap to be filled. It is a property of what the builtin harness is, and it needs a
founder decision rather than an engineering solution. See *The decision this forces* below.

## The mechanism, and why the answer falls out of it

`layers/agent-execution/harness-registry/src/builtin-harness-adapter.ts` (1013 lines) is a direct
LLM-API loop — plan → execute → reflect → stop — run **in HyperIdle's own process**. It spawns no
subprocess, opens no shell, and has no filesystem tools of its own.

Its entire tool surface is injected:

- `setSessionToolRegistry` injects a `ToolRegistry` for the session (`:151`, `:163`, `:171`).
- The model is offered exactly `toolDefsFromRegistry(registry)`, which is
  `registry.toClaudeToolSpecs()` and nothing else (`:999-1001`).
- Tool calls are dispatched back through that same registry in `executeToolCalls` (`:802-807`).

So the set of things a builtin agent can do is precisely the set of HyperIdle tools it was handed.
There is no path by which it runs `git merge`, writes a file directly, or uses its own credentials —
the capabilities that make the other four harnesses worth intercepting.

## What this means for the work package

The plan requires the loop to work on **every supported harness**, and equal harness coverage is
enforced mechanically in this repository. On builtin that requirement is satisfiable only by choosing
what it *means* here, because the literal target does not exist.

Three readings, and they are genuinely different products:

1. **Builtin is out of scope.** The permission list never matches anything for a builtin agent,
   because nothing a builtin agent does is in the category being governed. Honest, and matches the
   founder's ruling exactly. Cost: an agent on the builtin harness can never be held for approval, so
   "this action needs a human" is not a property of the workspace — it is a property of which harness
   the agent happens to run on. That is a surprising thing to discover later.
2. **For builtin only, the registry *is* the session.** Intercept at `registry.invoke`, because for
   this harness a tool call is not a detour around the agent's real work — it *is* the agent's real
   work. The founder's ruling was about the other harnesses, where MCP calls are a sideshow next to
   shell access. Cost: it reintroduces registry-level interception, which the rejected concept was
   built on, and someone will later read that code and think capture came back.
3. **Builtin is not a harness this feature applies to**, and the coverage rule is amended to say so
   explicitly, once, with the reason.

**My reading, offered not taken:** (2) is the one that keeps the *product* promise — a rule a team
sets means the same thing regardless of which harness an agent runs on — and the objection to it is
about how the code will be misread, which a comment fixes. But this is a founder call, not mine, and
it is the kind of thing that is much cheaper to decide now than after three harnesses are built.

## Unknown / not established

- Whether a builtin agent is ever the one doing consequential work in practice, or whether it is
  effectively the assistant-turn and light-task harness. If the latter, reading (1) costs almost
  nothing in reality and the decision is easy. This is a product-usage question, not a code question,
  and I did not attempt to answer it from the repository.
