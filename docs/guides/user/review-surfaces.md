# Review Surfaces

When an agent produces output — a staged refund, a field update, a code diff — HyperIdle renders it through a **review canvas** and you cast a verdict. By default it uses a generic canvas that works for any kind of artifact.

A **review surface** is a specialization of that canvas for a specific case. For example, the built-in `stripe-refund-review` surface replaces the generic action-operation canvas with a refund-specific layout: the charge id, customer, reversibility window, and a note that the approval routes through your Stripe connection. Same verdict, same gate — just a view tuned to what you actually need to judge.

## How a surface gets used

The agent picks the surface by name when it creates the artifact. If the agent names `stripe-refund-review` on a Stripe refund artifact, the review page renders that component instead of the generic canvas.

If the surface name is absent, unknown, or the surface fails to render, the generic family canvas for that artifact's kind takes over. You never see a blank screen.

## Where surfaces come from

Two sources:

**Built-in surfaces** ship with the app and are available to everyone after they update HyperIdle. A developer adds one by writing a component, registering it, and including it in the next release.

**Drop-in surfaces** are provided by third parties or your own team. They are pre-built `.js` files:

1. Drop the `.js` file into `~/.hyperidle/surfaces/`.
2. Restart HyperIdle.
3. The AI agent can now name the surface when creating artifacts.

No settings page, no install step — just drop the file and restart. The folder is created automatically on first use.

## The generic view is always the fallback

The nine family canvases (action operation, field change set, outcome summary, etc.) are always beneath every surface. If a surface is unavailable or fails, the family canvas for that artifact kind renders automatically. No configuration required — the floor always works.
