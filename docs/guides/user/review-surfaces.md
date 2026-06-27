# Review Surfaces

When an agent produces output — a staged refund, a field update, a code diff — HyperIdle renders it through a **review canvas** and you cast a verdict. By default it uses a generic canvas that works for any kind of artifact.

A **review surface** is a specialization of that canvas for a specific case. For example, the built-in `stripe-refund-review` surface replaces the generic action-operation canvas with a refund-specific layout: the charge id, customer, reversibility window, and a note that the approval routes through your Stripe connection. Same verdict, same gate — just a view tuned to what you actually need to judge.

## How a surface gets used

The agent picks the surface by name when it creates the artifact. If the agent names `stripe-refund-review` on a Stripe refund artifact, the review page renders that component instead of the generic canvas.

If the surface name is absent, unknown, or the surface fails to render, the generic family canvas for that artifact's kind takes over. You never see a blank screen.

## Where surfaces come from

Review surfaces are configured outside the running app — exactly like the Strategy (the AI model wiring) or the nine base canvases. A developer adds one by writing a component, adding a line to the static registry, and adding an entry to the surface catalog, then rebuilding. The surface ships with the next release and is available to everyone after they update.

There is no in-app install step, no settings page to adopt or swap surfaces. The available surfaces are a property of the release.

## The generic view is always the fallback

The nine family canvases (action operation, field change set, outcome summary, etc.) are always beneath every surface. If a surface is unavailable or fails, the family canvas for that artifact kind renders automatically. No configuration required — the floor always works.
