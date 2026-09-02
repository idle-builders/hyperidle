# BA11 — Interrupt the actions a team has learned are worth interrupting

## What we need

*Seed — not yet refined. The interview has not happened.*

BA2 made agents ask. It deliberately did not make anything stop them: an agent elects to raise a
review, and what it elects to ask about is the evidence this package would be built from. The founder's
framing when BA2's concept was set:

> *"How we classify what is bad needs some flexibility. These days no one maintains such lists
> anymore — if anything classifiers have become the thing."* But not yet: for now a permission list,
> intentionally empty at the start. On a fresh system the agent always self-elects; as the system gets
> better, a list of what to actually interrupt accumulates. A classifier is a later point.

So this package is the second half of that sentence, and it should not start until there is something
to build the list from — real reviews agents actually raised.

**The open question refine has to answer first:** is this a maintained list at all, or is it the
classifier the founder said the industry has moved to? BA2 assumed the list. Nothing has tested that.

## Where the previous attempt lives

This branch. It is not a description of the work — it is the work, built and CI-green, then removed
from `main`'s line when interception was cut from BA2. Cherry-pick rather than rebuild:

- `layers/agent-execution/harness-registry/src/provision-gate-hook.ts` — the four per-harness gate
  writers, each in that harness's own shape.
- `layers/agent-execution/harness-registry/src/action-gate-store.ts` — per-session rules, the pending
  denial, and a clearance keyed to rule-and-tool.
- `layers/core-api/settings/src/action-rules.ts`, `routes/settings-action-rules.ts`,
  `core-ui/src/settings/SettingsActionRules.tsx` — the scoped rule list and its settings surface.
- The `/action-check` route in `harness-registry/src/mcp/mcp-route.ts`.
- `framework/db/drizzle/0071_action_rules.sql` — the table. Note BA2 later dropped it.

## What the measurements say before you start

`.pipeline/work/BA2/harness-research/deep-*.md` — 268 claims, each tagged with the command that
produced it or the URL it came from. Read those, not the rulings. Four things there will cost a cycle
each if rediscovered:

- **Every harness fails open, and each hides it differently.** claude reports malformed hook JSON as a
  *successful allow*, indistinguishable from a healthy one. codex silently skips a hook whose config
  hash changed, with no output anywhere. cursor voids its entire hooks file when the matcher is written
  as an object — which is what cursor's own documentation shows. opencode logs nothing at all when a
  plugin fails to import, and `debug info` still lists it. **A gate must prove it fired; the presence
  of a config file proves nothing on any of the four.**
- **opencode's whole-tool deny removes the tool from the model's toolset.** The model never learns a
  rule exists and cannot ask. Only a pattern deny produces a denial it can see. The code on this branch
  gets this wrong.
- **codex's trusted hash.** Nothing on this branch writes
  `[hooks.state."<key>"] trusted_hash`; it leans on `--dangerously-bypass-hook-trust`, which works but
  emits error-shaped stream warnings and does not persist. Any edit to `hooks.json` disarms the gate
  silently.
- **A blocked call is invisible in codex's JSON stream.** Only stderr carries it. Nothing that watches
  the stream can know a gate fired.

## Not in this

- Anything BA2 owns: the review itself, the verdict, the resume path.
- The sandbox-isolation exposures found during BA2's research. They are real, live today, and belong
  to their own package — not this one.
