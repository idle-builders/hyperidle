# `design/no-raw-actor-fetch`

Forbid raw `fetch('/api/...')` calls in `layers/web/src/**` outside of
the hooks directory. Actor-authenticated routes must go through
`useRecoveryFetch` (or another actor-aware helper that lives in
`layers/web/src/hooks/`) so that `X-Actor-Id` (and any future
cross-cutting recovery / CSRF / idempotency-key concerns) are applied
uniformly to every request.

## Why

This rule exists because the same defect class shipped on three
consecutive Track-L stories. Each time, a route was added with a
literal `fetch(...)` and the actor identity header was silently dropped
— invisible to TypeScript, invisible to Biome, only caught by review:

- **L2** — `body.approverId` accepted client-side; raw fetch bypass.
  See `.pipeline/retro-log.jsonl` story `L2` and the `PROPOSED-L7-A`
  cross-reference (`L2`, `L4`, `L7`).
- **L4** — `body.actorId` accepted client-side. Retro: "Recurring auth
  pattern: client-supplied identity in body keeps reappearing across
  stories (L2, now L4) — same class of bug, different route."
- **L7** — kill-switch route silently dropped `X-Actor-Id` because the
  call was a literal `fetch(...)`. Retro: "Raw fetch() for kill switch
  silently dropped X-Actor-Id (SEC1 — SAME class as L2's findings,
  indicating recurring pattern)."

The L7 retro proposal `PROPOSED-L7-A` was explicit:

> Cross-track recurrence: raw fetch() bypassing X-Actor-Id helper. L2
> found it, L4 found it, L7 found it. Promote to a hard lint rule
> (custom ESLint: no fetch('/api/...', { method: 'POST' }) outside
> hooks/useRecoveryFetch.ts and __tests__).

This rule is the realisation of that proposal. It is wired at
`warn`-level today; the next track that touches the wider codebase will
clear the baseline and promote it to `error`.

## What is detected

A `CallExpression` whose callee is the bare global identifier `fetch`
and whose first argument is either:

- a string literal that starts with `/api/`, or
- a template literal whose first quasi starts with `/api/`.

`window.fetch(...)` and other member-style calls are **not** detected
(low signal, high false-positive risk for app-code; the convention is
to use the bare `fetch` identifier in HyperIdle web).

## Allowlist

The rule does not flag a call when any of these is true:

1. The file is under `layers/web/src/hooks/` — these files **are**
   the actor-aware wrappers (`useRecoveryFetch.ts`, `useFirstRun.ts`,
   `useMe.ts`, `useConversations.ts`, `useGlobalSearch.ts`,
   `useSystemStability.ts`).
2. The file is under any `__tests__/` directory.
3. The file ends in `.spec.ts`, `.spec.tsx`, `.test.ts`, or
   `.test.tsx`.

## Examples

### Bad

```tsx
// layers/web/src/pages/ConversationsReview.tsx
const res = await fetch("/api/conversations/responses", { method: "POST" });
```

```tsx
// layers/web/src/components/KillSwitch.tsx
await fetch(`/api/threads/${id}/verdict/undo`, { method: "POST" });
```

### Good

```tsx
// layers/web/src/pages/ConversationsReview.tsx
import { useRecoveryFetch } from "../hooks/useRecoveryFetch";

const fetchActor = useRecoveryFetch();
const res = await fetchActor("/api/conversations/responses", { method: "POST" });
```

```tsx
// layers/web/src/hooks/useRecoveryFetch.ts — the wrapper itself.
const res = await fetch(input, {
  ...init,
  headers: { ...init?.headers, "X-Actor-Id": actorId },
});
```

## Configuration

The rule is enabled at `warn`-level in the root `eslint.config.js` for
`layers/web/src/**/*.{ts,tsx}` with the same allowlist applied via
`ignores`. There are no rule options.

## Related

- `design/no-raw-tailwind-color` — a similar regex-detectable
  recurrence rule wired at `warn` for the same package.
- L7 retro proposal `PROPOSED-L7-A` — the source-of-truth proposal
  that motivated this rule.
