# BC6 — Session and platform as modules

## What we need

**Why this exists.** The contract has two non-object groups: session (see what's running · watch · stop — orchestration's) and platform (manage plugins — settings'). Both must be list entries mounted by the same loops so the lint rule covers the whole surface.

**What exists today.** Six session routes in `layers/agent-orchestration/src/routes/` (already close to the shape) and a separate session WS; six plugin routes in `routes/plugins.ts` plus the one surviving key; the composition root already joins each layer's routers on one Hono root.

**Missing delta.** The `session` module (orchestration) and `platform` module (settings) as list entries; the composition root joins each layer's action list; the session WS folded into the one stream. Deletes the twelve routes and the separate WS.

**Depends on.** BC4 — sequential by the module-link rule; its task link is rewired by BC5.

**Dials (provisional).** complexity: feature · ambiguity: established context · exposure: public contract

## How it works

## How we work on this

## Confusions

## Proposed items
