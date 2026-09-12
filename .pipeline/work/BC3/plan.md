# BC3 — Thread as a module: search · open · send a message · adjust

## What we need

**Why this exists.** Threads are the largest code path (`routes/threads.ts` 1,651 lines; the message-post handler ~350 lines in one function owning authz, transaction, events, WS push and a cross-layer call). Agents and humans post through different tools and routes today; the contract says one action.

**What exists today.** `layers/core-api/conversation` (755 lines, 'row write only — callers keep their own eventBus.emit'); `routes/threads.ts`, `threads-schema.ts`, `conversations.ts`, `assistant.ts`, `reviews.ts`; the `items` table with mandatory `threadId`; tools `send_message · reply · create_item · submit_review`; hooks `useThreadDetail · useAssistantThread · useConversationsThreads · useHostThread`; two hand-pushed WS sites; `policy-engine.ts` adjudicating `item_created`.

**Missing delta.** The `thread` module with four actions; `items` folded into messages as a kind (migration); sending with an existing id overwrites; the reply-to-caller rule and who-may-post-where as invariants; `thread.created · thread.message · thread.changed` from `changes` rows; the two WS push sites replaced by the stream from `changes`. Deletes the package, the routes, the table, the four tools, the hooks, `policy-engine.ts`.

**Depends on.** BC2 — copies the proven pattern and the loops.

**Dials (provisional).** complexity: suite · ambiguity: established context · exposure: public contract

## How it works

## How we work on this

## Confusions

## Proposed items
