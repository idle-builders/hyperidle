# Verdict-wiring increment review (AM1 / commit 9ef2a85e)

Scope: AL3 verdict-POST wiring completing the approve loop.
Files: `packages/web/src/services/host-threads.ts`, `packages/web/src/pages/review/ReviewPage.tsx`, + two test files.

---

## CRITICAL

### C1 — `resolvesMessageId` resolves the WRONG review message (wrong-resolve bug)
`packages/web/src/pages/review/ReviewPage.tsx:166-171`

`handleSubmitVerdict` sources `resolvesMessageId` as the **last** `type:"review"` message in
`hostThread.data.messages` and **ignores the route `reviewId` entirely** (it is not even read in
the verdict path, only `betId`/`reviewId` for the post-refresh loader call).

This is incorrect. The route `reviewId` IS the review message id. Evidence chain:

- Route: `packages/web/src/router.tsx:91` → `/work/bet/:betId/review/:reviewId`.
- The OpenTarget that produces this route is built directly from a review Message:
  `packages/shared/src/part.ts:287` and `:323` → `reviewTarget: { betId: "", reviewId: message.id }`.
  i.e. `reviewId === message.id` of the specific review/questionnaire message.
- Confirmed by fixtures: `packages/web/src/components/PartList.stories.tsx:54` → `reviewId: "m3"` (a message id).
- The server resolver does NOT do "last review" resolution. It resolves the EXACT id supplied:
  `packages/server/src/routes/threads.ts:1206-1216` selects the message by
  `eq(messages.id, input.payload.resolvesMessageId)` and only checks it exists + belongs to the
  thread. The `verdicts` map is keyed per `message.id` (`part.ts:286`), and reviews re-open
  (`threads.ts:1250` `willReopen`) — so multiple distinct `type:"review"` messages coexist in one
  thread by design.

Consequence: in any thread with more than one review message (the normal lifecycle — an agent posts
a second review after request-changes, or two parallel reviews), clicking Approve on review A
resolves whichever review message is LAST in the array, not the one the user opened. The user
approves the wrong review. There is no mapping layer anywhere that rewrites route `reviewId` into a
different message id (grep confirms: no `reviewId`→messageId transform in web or server).

The in-code comment "mirrors the policy-engine resolver" is **false** — there is no server-side
last-review resolution to mirror; the server trusts the client's exact id. The comment misleads the
next reader into thinking the behavior is contract-backed.

Correct behavior: `resolvesMessageId` MUST derive from the route `reviewId` (it already equals the
review message id). The "scan messages for the last review" loop should be deleted; use `reviewId`
directly (optionally validate it exists among the thread's `type:"review"` messages and bail if not).

NOTE this path is not yet live with real data (the `/api/reviews/:id` loader returns a static
fixture, `packages/server/src/routes/reviews.ts:4-62`, and only accepts `"rev-1"`), so the bug does
not corrupt prod data TODAY. But it is a latent wrong-resolve baked into the contract the moment the
loader returns real reviews — and the test (C2) locks the wrong contract in.

### C2 — Test bakes in the wrong-resolve behavior (tautological against the bug)
`packages/web/src/pages/review/__tests__/ReviewPage.test.tsx:88, 128-152`

The route is rendered with `reviewId: "rev-1"` (`:88`), but the seeded review message has
id `"review-msg-42"` (`:39`), and the test asserts `resolvesMessageId === "review-msg-42"` (`:147`).
That asserts the code resolves the **last review message**, NOT the **route's review** — the two are
deliberately different ids here. The test therefore passes BECAUSE of the bug and would fail a
correct implementation. It does not prove the approve loop resolves the review the user opened; it
proves the opposite.

A correct test sets the route `reviewId` to the review message's id and asserts
`resolvesMessageId === reviewId` (route-derived), and ideally adds a second review message that is
NOT the route target to prove the wrong one is not chosen.

---

## WARNINGS

None. (The verdict body contract, decision enum, and status-code handling are all correct — see below.)

---

## NITs

### N1 — 403 maps to silent refresh; can mislead
`ReviewPage.tsx:172-182`, `host-threads.ts:139` (`403 → "forbidden"`)
On 403 the page silently refreshes and shows the (unchanged, unresolved) state with no message to
the user that their verdict was rejected for lack of authority. The server's 403 is also returned by
the earlier generic participant/boundary checks, not only `verdict_authorization` — the client maps
any 403 to "forbidden". Acceptable as recovery (authz is server-owned, refresh shows truth), but a
user lacking authority gets no feedback distinguishing "nothing happened" from "you can't do that".
NIT only — surface a notice in a follow-up. The returned `VerdictPostOutcome` is currently discarded
by the caller (`ReviewPage.tsx:179` does not capture the return value), so the "race"/"forbidden"
distinction the service carefully computes is thrown away. If it is never consumed, the outcome union
is dead richness (simplification flag) — but keeping it is fine if the follow-up wires user feedback.

### N2 — `request-changes` decision not surfaced
`ReviewComposition.tsx:126` overflow menu offers `approve-with-comments`, `edit`, `reject`; primary
buttons are `approve` and (via the "request changes" button) — confirm `request-changes` is reachable.
All submitted values are within `VERDICT_DECISIONS`, so no contract violation; just verify the full
decision set is reachable from the UI. NIT.

---

## Contract checks that PASS (verbatim verification)

- **Verdict POST body** (`host-threads.ts:128-133`): `{ type:"verdict", payload:{ decision, resolvesMessageId }, clientKey }`
  matches `verdictPayloadSchema` (`threads-schema.ts:144-148`: `decision`, `resolvesMessageId`, optional `note`)
  and the `type:"verdict"` branch of `messageInputSchema` (`:174-178`). Match confirmed.
- **Decision enum**: param type `VerdictDecision` === `VERDICT_DECISIONS`
  (`shared/src/thread.ts:34-41`: approve, approve-with-comments, request-changes, edit, reject). Every value the UI
  submits (`approve`, `approve-with-comments`, `edit`, `reject` from `ReviewComposition.tsx:126,140`) is in the enum.
- **Race/authz handling** (`host-threads.ts:137-140`): `resp.ok → "ok"`, `409 → "race"`, `403 → "forbidden"`,
  else throw. Server returns 409 `verdict_race` (`threads.ts:1314`) and 403 `verdict_authorization`
  (`threads.ts:1222`). Status-code-based mapping is correct and robust to the `code` field. Both non-OK
  conditions are non-throwing. 500 still throws (correct — unexpected error propagates per TS rules). PASS.
- **Refresh on all paths**: `ReviewPage.tsx:180-182` refreshes the host thread and reloads the subject after the
  await regardless of outcome — authoritative-state recovery is correct. PASS.
- **Security / authz**: client does NOT attempt to authorize; it relies entirely on the server
  (`threads.ts:1217-1223` enforces `isFounder && !selfVerdict`). `@lore` block at `host-threads.ts:98-108`
  correctly documents server ownership of authz/idempotency/first-verdict-wins. No new injection/XSS surface —
  `threadId` is `encodeURIComponent`-wrapped (`host-threads.ts:135`), `clientKey` is a `crypto.randomUUID()`,
  decision is enum-constrained, `resolvesMessageId` is server-validated against the thread. PASS.
- **`clientKey`**: `crypto.randomUUID()` (36 chars, URL-safe) satisfies `clientKeySchema` (8-128, `[A-Za-z0-9_\-:.]`). PASS.
- **`host-threads.test.ts:211-285`**: genuinely asserts the POST URL, method, body `type`/`decision`/
  `resolvesMessageId`/`clientKey`, and the three outcomes + the throw. These are real, non-tautological
  assertions on the service. PASS.

---

## VERDICT: NOT DONE

Must-fix before this increment is correct:

1. **C1** — derive `resolvesMessageId` from the route `reviewId` (which IS the review message id), not from
   "last `type:"review"` message in the thread array. Delete the message-scan loop and the false
   "mirrors the policy-engine resolver" comment.
2. **C2** — rewrite the ReviewPage approve test so the route `reviewId` equals the review message id and the
   assertion is `resolvesMessageId === reviewId`; add a non-target review message to prove the wrong one is
   not selected. The current test must not be allowed to lock in the wrong-resolve contract.

NITs (N1 outcome-feedback, N2 decision reachability) are non-blocking.
