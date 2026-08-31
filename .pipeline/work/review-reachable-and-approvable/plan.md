# Review reachable and approvable

## What was broken

A human could not reach or approve a real review. Four separate breaks, each
independent of the others:

1. **The review page only opened from a bet-hosted thread.** `Conversations`
   built the "Open review" target from `subject?.taskId ?? subject?.betId`,
   then the open handler returned early when there was no bet id. A
   task-hosted review (a task with no bet — the rule this branch enforces)
   never got a working "Open review" button, even though its sibling
   "Inspect review" control rendered unconditionally and navigated nowhere
   useful.
2. **The approve button could not fire for real.** The route was
   `/work/bet/:betId/review/:reviewId`. `ReviewPage` derived the thread to
   post a verdict to by guessing it from a by-host lookup
   (`getFirstThreadByHost`) using `subject?.taskId ?? subject?.betId`. Only a
   hardcoded fixture, whose single thread happened to be the right one, made
   this look like it worked. A host with more than one thread resolves to
   whichever thread the lookup returns first — not necessarily the review's
   own thread.
3. **`submit_review` posted the review message to the bet's thread**, not the
   task's, via `getFirstThreadByHost("bet", betId)`. A task without a bet had
   nowhere for its review to land correctly, and even a task with a bet had
   its review filed under the wrong host.
4. **A thread `submit_review` creates has no human participant.** An
   agent-raised review that creates its own thread seeded no human into
   `participants`, so the thread — and the review inside it — was
   unreachable by construction: no founder/human account could ever see it
   in `Conversations`.

## The rule

A review lands in the thread the task already has, or a new one attached to
the task — **never the bet's thread** — because tasks will exist without
bets. (Founder ruling 7.) Any thread `submit_review` creates gets the sole
human user seeded as a participant, using the same `findSoleHumanUser` seam
the no-calling-thread reply fallback already uses.

Once the review's own thread is fixed at creation time, every downstream
consumer (the API, the loader, the page, the route) can simply carry and use
that thread id directly — nothing needs to re-derive it from a host lookup
ever again. That collapse is what removes breaks (1) and (2): both were
guesses standing in for information the system already had.

## The fix, commit by commit

**`6f24c6b9c` — `submit_review` anchors on the task's thread, never the
bet's.**
`resolveReviewThreadId` (extracted in `tool-definitions.ts`) resolves via
`getFirstThreadByHost("task", ctx.taskId)` instead of
`getFirstThreadByHost("bet", betId)`: reuse the task's existing thread if one
exists, else create one. A newly created thread seeds the sole human via
`findSoleHumanUser` so the review is reachable the moment it exists.
Proven by `submit-review-task-anchor.integration.test.ts`: reuse of an
existing task thread over a coexisting bet thread, thread creation when
neither exists, human-participant seeding on creation, and correct anchoring
for a task with no bet at all. The two pre-existing `submit_review`
integration tests that encoded the old bet-anchored behavior were updated to
the new one — they did not previously fail against a stub of the fix; they
encoded the wrong shape being right.

**`955d48db8` — `GET /api/reviews/:id` returns the review's own `threadId`.**
`layers/core-api/src/routes/reviews.ts` now composes `reviewMsg.threadId`
into every non-fixture response, instead of the client having to derive a
host and guess. Proven by `reviews-loader-thread-id.integration.test.ts`
against both a single-thread host (where a guess would have accidentally
worked) and a multi-thread host (where a guess resolves to the wrong
thread) — the response's `threadId` matches the review message's actual
thread in both cases.

**`a1a4ef8ad` — flatten the route to `/reviews/:reviewId`; delete the
bet-gated render check.**
- Route: `work/bet/:betId/review/:reviewId` → `reviews/:reviewId` in
  `layers/core-ui/src/router.tsx`. **Deleted, not redirected** — no
  persisted row anywhere holds the old shape, so a redirect would be a
  compat layer bridging nothing, which CLAUDE.md's migration rule forbids.
- `ReviewPage.tsx` now fetches its thread with `useThreadDetail(subject?.threadId ?? "")`
  — the loader-named thread — instead of deriving a host
  (`subject?.taskId ?? subject?.betId`) and guessing via a by-host lookup.
  Both `handlePostComment` and `handleSubmitVerdict` post to
  `reviewSubject.threadId` for the same reason.
- `Conversations.tsx` / `open-handler.ts` / `part.ts` build the "Open review"
  target as `/reviews/${reviewId}` unconditionally — there is no longer a
  bet-id gate to fail for a task-hosted review.
- Every consumer of the deleted route was found by search and updated in
  this commit: 3 Playwright e2e specs (`AZ16-token-profiles.spec.ts`,
  `page-layout.spec.ts`, `page-orientation.spec.ts`), plus component/unit
  tests and stories asserting the old path or a `betId`-shaped
  `OpenTarget` (`AM1-PartList`, `AM1-navHandler`, `AM3-session-view`,
  `AM5-T6-splitview`, `AM5-T7-host-route`, `AM5-T8-block-anchor`,
  `Conversations.part-migration`, `Conversations.reasoning`,
  `page-outline-ledger`, `ConversationSurface.stories`,
  `PartList.stories`).

## How it was proven

`Conversations.review-routing.test.tsx` carries the two properties that make
this branch trustworthy, both intact and passing:

1. **Reachability is proven at the `Conversations` level, not the
   `ReviewPage` level.** The test that proves "Open review" renders for a
   task-hosted thread mounts `Conversations` and clicks the real button.
   Mounting `ReviewPage` directly would go green while the entry point that
   reaches it stays invisible — it would prove nothing about reachability.
2. **The approve test seeds two threads under the same host and makes the
   by-host lookup resolve to the wrong one**, so a design that still
   guesses cannot pass. `NAMED_THREAD_ID` is the thread the loader's
   `threadId` field names; `GUESSED_THREAD_ID` is what a by-host lookup
   would return first. The test asserts the verdict POST lands on
   `NAMED_THREAD_ID` and never on `GUESSED_THREAD_ID`. This is the test an
   earlier, reverted regression probe (a deliberately reintroduced by-host
   guess) reddened — proof the test actually catches the regression it
   exists to catch.

Supporting proof per break:
- Break 3/4 (server-side anchor + human seeding): `submit-review-task-anchor.integration.test.ts`.
- Break 2 (server response naming the real thread): `reviews-loader-thread-id.integration.test.ts`.
- Break 1/2 (client-side reachability + no-guess approve):
  `Conversations.review-routing.test.tsx`.

## Verification run for this branch

- `npm run check` — 0 errors, all 39 packages pass.
- `npm run lint` — exit 0 (Biome + ESLint + governance-lint all pass; only
  pre-existing WARN-level governance notes unrelated to this change).
- `core-ui` component/unit suite — 342 files, 3462 tests, all passing.
- Service integration suite (`test:integration:service`) — 308 files
  passing (1 pre-existing skip), 2434 tests passing (4 pre-existing skips).
- Consumer sweep for the deleted route: no route registration, link
  builder, or navigation left pointing at
  `/work/bet/:betId/review/:reviewId` anywhere in `layers/`,
  `applications/`, or `framework/` — the only remaining occurrences of that
  string are `@lore`/comment references explaining the flatten.

## Independent review

Not yet done. An independent review of this PR is still owed before merge.
