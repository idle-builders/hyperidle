# Target interface surface — starting point

Founder's draft, 2026-09-10. **Not settled.** A starting point to iterate against code
and against web research.

## Corrections to earlier framing in this session

- **Code sprawl means the whole codebase**, not the route table. The route table was my
  narrowing, not the problem statement.
- **The only structure in this system that was thought out is the service structure.**
  The interface surface has never been structured. Most of the rest is accumulated
  invention, not design.
- **Context assembly is a real construct**, deliberately built: it gets an agent started and
  keeps a clean layer between core and agent-orchestration. Not sprawl.
- **Do not argue from invented concepts.** Either research it, or interview the founder about
  what he considers a valid concept. Past software-engineering patterns may simply not apply;
  what's relevant is very recent work.

## The inversion

**Humans are more capable than agents. So the tool surface is designed first, for agents,
and the UI is built to follow that same unified structure.**

Designing this the way a typical UI or desktop application is designed is how it fails.

## Objects first

Four objects: **task · thread · document · user**.

A user is a user. An agent and a human get the same actions — there is no separate set.

## Actions — the draft

### Task
- **list / search** — no parameter, or filter by name, or by parent task, or by dependent task
- **read** — everything: content, assignment, tree, …
- **edit** — new or existing. Title, state, attachments, content, assignment (which is handoff)

### Thread
- **list / search** — with or without a parameter
- **read** — all message parts, title, recipients, attachments, reviews, …
- **write a message to recipients** — a thread id defines the recipients; naming recipients
  instead starts a new thread. The message may be plain, a review verdict, an attachment, …
- **adjust the thread** — title, recipients, delete

### Document
- **list / search** — with or without a parameter
- **read** — all parts and everything included: content, meta, conflicts, path, …
- **edit** — new or existing. Title, content, type, meta, move, merge, split, conflicts

### User
- **list / search** — with or without parameters, e.g. everyone on a team
- **read** — role, team, org edges, prompt, attached skills, …
- **edit** — name, prompt, skills, edges, team, …

## Files

Files are not an object with its own actions. An attachment — on a review, on a task,
anywhere — is a file.

- For an **agent**, that file is in its filesystem. It looks at it there.
- For a **human**, reaching it is reaching a filesystem: git, S3, Drive, local.

Files sit somewhere and are addressed as files.

## What is notable about this draft

Stated plainly, without naming a pattern for it:

- **Thirteen actions**, against 126 routes and 20 tools today.
- **One write per object, and it is an upsert.** "Edit" covers create and update in one, and
  absorbs what are currently separate routes: state change, assignment/handoff, attachments,
  move, merge, split, conflicts.
- **Read returns the whole object**, including its relations — not a row to be followed with
  more calls. The current surface makes an agent walk `GET /teams` → `GET /teams/:id` →
  `GET /teams/:id/membership`; this does not.
- **List and search are the same action**, distinguished only by whether a parameter is given.
- **Thread is the one object with two writes** — appending a message is not the same act as
  changing the container.

## Open questions to resolve against code and research

1. Where do routines live? A routine's prompt is already a document. Is the routine itself a
   fifth object, or is it a document with a trigger?
2. Where does the platform surface go — keys, connections, filesystems, plugins, backends?
   It is not one of the four objects and it is not plumbing either; a person genuinely does
   these things.
3. `items` is still a fifth content table beside `messages`, with no UI reader. Does it become
   a message, a document, or go?
4. Does "edit" as a whole-object upsert give up validation that currently lives in narrow
   routes — for example rejecting an invalid harness/model/provider combination?
5. Notifications and events are not in this draft. The user-event half still needs its shape.
