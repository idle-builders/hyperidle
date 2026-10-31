# Reviews

## How a review works

An agent (or a person) sends a message of type `review` when it wants a person's judgement. An
agent's session ends there. The reviewer opens the review from its thread — the address is the
thread's, `/conversations/<thread>?review=<message>` — checks it, comments on what they see, and
approves or rejects it. The agent's session resumes with the verdict.

A reviewer checks; they do not read. They were part of the work earlier, and they follow
**pointers**: the agent's flags and their own pins. No review is approved by itself.

## What a review holds

Source: `framework/domain-model/src/review.ts`, `reviewPayloadSchema` in
`framework/domain-model/src/actions/thread.ts`.

- `title`, and `reasoning` — what the sender says about it, a line each.
- `stage` — which stage of the work this reviews, in a word or two ("Design", "Final").
- `parts` — what there is to look at. The sender composes them for the question.
- `flags` — the sender's own pointers.
- `previousReviewId` and `changed` — on a round that retries a rejected one.
- `reviewer` — the one person who reviews it; absent means anyone in the thread but its sender.
- `taskId` — the work item, stamped by the server from the sending session.

### Parts

Each part has an `id` (unique in the review), a `label` (the kind of thing in the sender's words:
"Live preview", "Email") and a `title`. Six kinds:

| Kind | What it is | Its own fields |
|---|---|---|
| `preview` | A live page, looked at at desktop, tablet and phone widths | `url`: http(s), or a whole page as `data:text/html` |
| `code` | A diff | `files`: each a `path` and `hunks` of `lines` — `op` (`add`, `del`, `same`), `n` (the new file's number; a removed line's old one), `text` |
| `image` | A design or a screenshot | `url` (http(s) or `data:image/…`), `alt` |
| `numbers` | Figures | `figures`: `label` (unique), `value`, `change`, `good` |
| `text` | Prose: an email, a piece of copy | `subject`, `to`, `body` |
| `items` | A batch of the same kind of thing, such as three replies to customers | `items`: `id` (unique), `title` (a few words), `body` |

A `data:text/html` preview runs in the same sealed box as an app: its scripts run, but it cannot
reach HyperIdle, its storage or the network. HyperIdle never reads inside it; a small script it adds
to the page answers by message what is under the pointer and where a pinned element is now, so a
person can point at any element. An http(s) preview runs as its own site, and one from HyperIdle's
own address runs as no site at all, so its scripts cannot reach into HyperIdle; HyperIdle cannot see
inside either, so a comment on it is on the whole page.

### Pins

A pin says where a flag or a comment points: `id`, `part`, `label` (a few words naming the spot)
and, when it is narrower than the whole part, a `spot`. Each kind of part is pointed at its own
way:

| Part | Spot |
|---|---|
| preview | `element`: a CSS `selector` |
| code | `line`: `file` and `line`; `removed: true` for a removed line, by its old number |
| image | `region`: `x`, `y`, `w`, `h`, as fractions of the image |
| numbers | `figure`: its `label` |
| text | `range`: characters `start` up to `end` of the body |
| items | `item`: its id |

`pinProblems` refuses a pin whose part does not exist, whose spot is the wrong kind for its part,
or that points at something the part does not show.

### Flags

A flag is a pin plus `says`: the sender's words — "I decided this without asking", "I am not sure
about this", "this touches customers". Agents are trusted to flag their own uncertain spots, so a
review nobody reads still shows where to look.

## The review page

Code: `layers/core-ui/src/Judge.tsx`, `ReviewPart.tsx`, `Loop.tsx`.

- **The top line** — "Review", its stage and round, who sent it, and the verdict buttons with the
  count of open questions beside them.
- **What the sender says**, a line each; on a later round, what changed since the one before, and a
  link back to that round with its rejection reason and how many questions are still open there.
- **The loop** — when the review is on a task, its "Done when" lines (what already checked itself,
  and what waits for a person) and its decisions and assumptions sit above the work, so the reviewer
  spends attention on the rest. See [task.md](../objects/task.md).
- **The parts**, each with the width of the page: a live page you switch between desktop, tablet
  and phone widths, code, an image, numbers, text, a batch of items. A preview, code or image has
  "More space". Flags and comments are pins on the parts; clicking a spot makes a new pin and opens
  its thread beside it.
- **Questions on this review** — every pin as a row, so a comment is never lost on the page, with
  whether it is open, answered or settled.
- **Anything overall?** — a chat box for a comment on the whole review.

## Comments

A comment on a part is a plain message in the review's thread with an `anchor`: a pin plus
`review`, the review message's id. Each pin is its own little thread — a reply repeats the pin,
`id` and all; a reply to a flag takes the flag's pin. The server refuses an anchor whose review is
not in the same thread (`anchor_review_unknown`) or whose pin does not fit the part. An anchor
without `review` points at a stretch of the text of the document the thread is about (see
[thread.md](../objects/thread.md#comments-on-a-document)).

A comment is open until someone other than its asker replies (then answered). A flag is open until
someone replies to it or the review is approved (then settled). Open questions never block Approve;
their count sits beside it.

Anything said about the whole review is a plain message in the thread. Mentioning someone with @
brings them in, the same as anywhere else.

## Rounds

A retry is a new review on the same work item, never an edit of the old one: round 2 names round 1
in `previousReviewId` (a review in the same thread, else `previous_review_unknown`) and says what
`changed`. Comments stay on the round they were made on, and so do its open questions; round 2
links back to round 1, shows its rejection reason and how many questions are still open there.

## Verdicts

**Approve** or **Reject**. A reject must say why — the reason goes back to the agent and its
session. There is no send-back: to ask for a change, comment. Either verdict resolves the review,
which changes the thread's and the task's need at once.
