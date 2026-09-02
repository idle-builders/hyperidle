# BA12 — A session's filesystem belongs to the work, not the session

## What we need

*Seed — not yet refined. The interview has not happened.*

Today a sandbox is created when a session starts and destroyed when it ends, unconditionally, at both
teardown paths in `provisioner.ts`. So the filesystem belongs to the **session**. It should belong to
the **work**.

The founder's rule, given while proving BA2:

> *"We need to either keep the sandbox or maybe stop being clear about what is the sandbox and that is
> the filesystem — and obviously we need to keep the state of the filesystem alive till the agent says
> it's done. Only the agent actively deciding it's done means we can actually delete the filesystem
> parts of the sandbox."*

Two halves, and they are the same rule seen from each end:

- **Session creation.** A session started for work that already has a filesystem gets *that*
  filesystem, at the same path, rather than a fresh empty one.
- **Session continuance.** A resumed session finds the work exactly as it left it — the same files, at
  the same path.

And the deletion rule: a filesystem is deleted when **the agent says it is done**, not when a session
ends. Anything else is a session pausing, not work finishing.

## Why it matters now

BA2's loop is proven with this broken. An agent raises a review, its session ends, a human answers days
later, the agent is resumed — and it finds its own conversation but not the files it made. It believes
work exists that does not. BA2 was proven with the gap in place deliberately, and its proof is weaker
for it: the loop closes, but an agent does not return to its own work intact.

## What refine has to settle

- **What owns a filesystem** — the task? the root task? something else? BA2 assumed the task, and
  nothing has tested that.
- **What reaps abandoned work.** "Delete when the agent says it is done" leaves everything the agent
  never finished. On a laptop that accumulates.
- **Whether `sandbox` is still one thing.** The founder's own phrasing questions it: a sandbox today
  bundles a filesystem with process isolation, config we write, and a lifetime. If the filesystem
  outlives the session, they are not one noun any more.

## Where the constraint bites hardest

`harness-research/deep-cursor-agent.md` — cursor-agent keys a chat on an **md5 of the cwd string**
(`~/.cursor/chats/<md5(cwd)>/`). Resuming from any other directory exits 0, echoes back the correct
session id, and runs with **no context at all**, silently. BA2 already carries the original path on the
resume for this reason. Whatever this package does with paths must keep that true, or a cursor resume
silently loses everything and nothing reports it.

## Not in this

- BA2's review loop itself — the review, the verdict, the resume path.
- Interception, which is BA11.
