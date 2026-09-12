# BC2 — The action list, proven end to end on task

## What we need

**Why this exists.** The mechanism that has never existed — declare an action once, project it to a route, a tool, a UI affordance and a lint check — is what makes reach parity a property instead of an audit. Proving it on the smallest object first means BC3–BC6 copy a working pattern instead of inventing one each.

**What exists today.** `layers/core-api/work` (1,814 lines) with 14 public methods; 8 task routes in `routes/tasks.ts` (627 lines) owning validation, transactions, events and shaping; four task tools (`create_task · edit_task · handoff_to · log_task`) reaching those routes through an HTTP client seam (`CoreApiPort`); three UI hooks and one hand-copied wire type. The tool-definition shape (`name · description · inputSchema · handler · roles`) is already the action shape; only the tool registry reads it. The event bus is in-memory and unpersisted.

**Missing delta.** The action shape and `ctx` in `framework/domain-model`; the `changes` table and its append helper; the `task` module (search · open · edit, the state machine as `invariants`, one read model for the list); the HTTP mount loop, the MCP register loop (in-process, the first tool that does not use the seam), the UI client type and `call`; the governance rule (every entry mounted, registered, referenced; every route an entry or plumbing; every tool an entry; every emitted event one of 9 + 8); the task page and tree reading through `call` and `invariants`. Deletes `work`, the task routes, the four tools and their seam methods, the hooks, the wire type, and the task half of `policy/lifecycle-propagation.ts`.

**Depends on.** BC1 — the rule's plumbing list must be the real sixteen; the attention column must be gone before the read model is cut.

**Dials (provisional).** complexity: suite · ambiguity: established context · exposure: public contract

## How it works

## How we work on this

## Confusions

## Proposed items
