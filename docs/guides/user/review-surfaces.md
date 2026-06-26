# Review Surfaces

When an agent produces output — a staged refund, a field update, a code diff — HyperIdle renders it through a **review canvas**, and you cast a verdict. By default it uses a generic canvas that works for any kind of artifact.

A **review surface** is a specialization of that canvas for a specific tool and task. For example, the built-in `stripe-refund-review` surface replaces the generic action-operation canvas with a refund-specific layout: the charge id, customer, reversibility window, and a note that the approval routes through your Stripe connection. Same verdict, same gate — just a view tuned to what you actually need to judge.

## How it works

Review surfaces are code, not magic. Each surface is a React component that specializes one of the nine base canvases. It only changes presentation — it never changes the verdict, the staged action, or the approval gate. If a surface fails to render, the base canvas takes over automatically (the floor always works).

A surface only renders for your team if you **deliberately adopted** it. Adoption is a committed, version-pinned choice your team makes. You can always see which surface rendered any given review, and which team member made the adoption.

## Adopting a surface

1. Open **Settings → Review surfaces**.
2. The page shows two groups:
   - **Adopted** — your team's active mappings (situation → surface), each showing the surface name, version, and provenance.
   - **Available** — surfaces in your registries not yet assigned to any situation.
3. Click **Browse registry** (or **Adopt…** on any Available row) to open the browse dialog.
4. In the dialog, select a surface from the list. The right panel shows its description, base canvas, provenance, and trust tier — and a live preview in dev mode.
5. Click **Adopt for `<situation>`** to commit. The Adopted group refreshes immediately.

## Swapping a surface

To replace an adopted surface with a different one: on the Adopted row, click **⋯ → Swap…**. The browse dialog opens pre-bound to that situation; select the new surface and confirm. The old adoption is replaced.

To return to the generic base canvas: click **⋯ → Reset to base canvas** and confirm (two-click). The mapping is deleted; the situation now renders with the base canvas.

## What provenance and trust tier mean

Each surface carries two trust signals shown on every row and in the browse dialog:

| Signal | Values | What it means |
|---|---|---|
| **Provenance** | `first-party` / `community` | Who authored it — HyperIdle maintainers or a community contributor. |
| **Trust tier** | `vetted` / `community` | How it was reviewed before being published. `vetted` surfaces have been reviewed by HyperIdle; `community` surfaces are reviewed at adopt time by your team. |

Trust is about **adopt-time code review and ownership**, not a runtime sandbox. Before adopting a community surface, review its source — it runs in your app.

## What always works

The base canvas is always beneath every surface and is always the fallback:

- No adoption for a situation → the base canvas renders.
- Adopted surface fails to render → the base canvas renders; the examine pane shows a subtle "surface unavailable" note.
- You deleted an adoption → the base canvas renders immediately.

You never see a blank screen or a crash because of a surface.

## The "Rendered by" line

Inside a review, the examine pane shows a quiet status line:

```
Rendered by  stripe-refund-review @1.0.0  ·  First-party · vetted       [ Swap ▸ ]
```

When the base canvas is rendering (no adoption, or the surface failed), it shows:

```
Base canvas (action_operation)
```

or, if a surface failed to load:

```
Base canvas · surface unavailable
```

The **Swap** button opens the browse dialog pre-bound to that situation — so you can adopt a surface without leaving the review.
