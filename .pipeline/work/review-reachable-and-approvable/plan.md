# Review reachable and approvable

## What was broken

A human could not reach or approve a real review. Four independent breaks:

1. **The review page only opened from a bet-hosted thread.** `Conversations` built the "Open review"
   target from `subject?.taskId ?? subject?.betId` and the open handler returned early with no bet id.
   A task-hosted review — a task with no bet, the rule this branch enforces — never got a working
   button, though its sibling "Inspect review" control rendered unconditionally and went nowhere.
2. **The approve button could not fire for real.** `ReviewPage` derived the thread to post a verdict to
   by guessing it from `getFirstThreadByHost` on `subject?.taskId ?? subject?.betId`. Only a hardcoded
   fixture, whose single thread happened to be the right one, made this look like it worked. A host
   with more than one thread resolves to whichever comes back first.
3. **`submit_review` posted the review message to the bet's thread**, via
   `getFirstThreadByHost("bet", betId)`. A task without a bet had nowhere for its review to land, and
   a task with a bet had its review filed under the wrong host.
4. **A thread `submit_review` creates had no human participant.** An agent-raised review creating its
   own thread seeded no human into `participants`, so the thread — and the review in it — was
   unreachable by construction.

## The rule (founder ruling 7)

A review lands in the thread the task already has, or a new one attached to the task — **never the
bet's thread** — because tasks will exist without bets. Any thread `submit_review` creates seeds the
sole human user as a participant, through the same `findSoleHumanUser` seam the no-calling-thread
reply fallback already uses.

Once the review's own thread is fixed at creation time, every downstream consumer — API, loader, page,
route — carries and uses that thread id directly and never re-derives it from a host lookup. That
collapse is what removes breaks 1 and 2: both were guesses standing in for information the system
already had.

## How it works now

**Server anchor.** `resolveReviewThreadId` (in `tool-definitions.ts`) resolves via
`getFirstThreadByHost("task", ctx.taskId)`: reuse the task's existing thread, else create one, seeding
the sole human on creation.

**API names the thread.** `layers/core-api/src/routes/reviews.ts` composes `reviewMsg.threadId` into
every non-fixture `GET /api/reviews/:id` response, so the client never derives a host.

**Route flattened** from `/work/bet/:betId/review/:reviewId` to `/reviews/:reviewId`. **Deleted, not
redirected** — no persisted row anywhere holds the old shape, so a redirect would be a compat layer
bridging nothing, which CLAUDE.md's migration rule forbids. `ReviewPage` fetches with
`useThreadDetail(subject?.threadId ?? "")` and both `handlePostComment` and `handleSubmitVerdict` post
to `reviewSubject.threadId`. `Conversations` / `open-handler` / `part.ts` build the target as
`/reviews/${reviewId}` unconditionally — no bet-id gate left to fail.

Every consumer of the deleted route was found by search and updated in the same commit: three
Playwright specs plus eleven component/unit tests and stories that asserted the old path or a
`betId`-shaped `OpenTarget`.

## The two properties that make this trustworthy

Both live in `Conversations.review-routing.test.tsx` and are the reason to keep it intact.

1. **Reachability is proven at the `Conversations` level, not the `ReviewPage` level.** The test mounts
   `Conversations` and clicks the real "Open review" button on a task-hosted thread. Mounting
   `ReviewPage` directly would go green while the entry point that reaches it stayed invisible.
2. **The approve test seeds two threads under the same host and makes the by-host lookup resolve to
   the wrong one**, so a design that still guesses cannot pass. `NAMED_THREAD_ID` is what the loader's
   `threadId` names; `GUESSED_THREAD_ID` is what a by-host lookup returns first. The verdict POST must
   land on the former and never the latter. A deliberately reintroduced by-host guess reddened exactly
   this test, so it catches the regression it exists to catch.

Server-side proof: `submit-review-task-anchor.integration.test.ts` covers reuse of an existing task
thread over a coexisting bet thread, creation when neither exists, human-participant seeding, and
anchoring for a task with no bet. `reviews-loader-thread-id.integration.test.ts` checks the response
`threadId` against both a single-thread host (where a guess would accidentally work) and a multi-thread
host (where it would not).

Note on the two pre-existing `submit_review` integration tests: they were updated, not repaired. They
never failed against a stub of the fix — they encoded the wrong shape as right.

## Still owed

An independent review of this branch before merge.
