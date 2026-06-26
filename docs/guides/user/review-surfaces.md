# Review Surfaces

When an agent produces output — a staged refund, a field update, a code diff — HyperIdle renders it through a **review canvas**, and you cast a verdict. By default it uses a generic canvas that works for any kind of artifact.

A **review surface** is a specialization of that canvas for a specific tool and task. For example, the built-in `stripe-refund-review` surface replaces the generic action-operation canvas with a refund-specific layout: the charge id, customer, reversibility window, and a note that the approval routes through your Stripe connection. Same verdict, same gate — just a view tuned to what you actually need to judge.

## How it works

Review surfaces are code, not magic. Each surface is a React component that specializes one of the nine base canvases. It only changes presentation — it never changes the verdict, the staged action, or the approval gate. If a surface fails to render, the base canvas takes over automatically (the floor always works).

A surface only renders for your team if you **deliberately adopted** it. Adoption is a committed, version-pinned choice your team makes. You can always see which surface rendered any given review, and which team member made the adoption.

## Browsing the catalog

Open **Settings → Review surfaces** and click **Browse registry**. The browse dialog shows:

- **HyperIdle Official** — the curated catalog that ships with HyperIdle (first-party surfaces).
- **Community registries** — additional catalogs your team has added by URL. Each entry in a community catalog shows its provenance and description; clicking an uninstalled surface shows "install via `add …`".

A team administrator can add a community registry by URL — the app fetches the catalog's index (name, version, surface list) and shows it alongside the official catalog.

## Installing a community surface

Installing a community surface is a **build-time step** — the surface code is copied into the app and rebuilt before it becomes available. This is intentional: the surface runs in your app, so your team reviews the source before it ships with a release.

Steps:

1. Find a surface in the browse dialog (or copy its source URL from the community registry).
2. A developer runs: `npm run surface:add -- <source>` where `<source>` is the surface URL, a `github:owner/repo/item` shorthand, or a local path.
3. The command copies the source files, generates registration glue, and prints the changed files.
4. Review the changed files, commit, and rebuild (`npm run build`).
5. After rebuild, the surface appears in **Available** in Settings → Review surfaces.
6. Adopt it for the situation you want — done.

The installed surface ships with your next release and is available to all team members after they update.

## Adopting a surface

1. Open **Settings → Review surfaces**.
2. The page shows two groups:
   - **Adopted** — your team's active mappings (situation → surface), each showing the surface name, version, and provenance.
   - **Available** — surfaces installed in the app but not yet assigned to any situation.
3. Click **Browse registry** (or **Adopt…** on any Available row) to open the browse dialog.
4. In the dialog, select a surface from the list. The right panel shows its description, base canvas, and provenance — and a live preview in dev mode.
5. Click **Adopt for `<situation>`** to commit. The Adopted group refreshes immediately.

## Swapping a surface

To replace an adopted surface with a different one: on the Adopted row, click **⋯ → Swap…**. The browse dialog opens pre-bound to that situation; select the new surface and confirm. The old adoption is replaced.

To return to the generic base canvas: click **⋯ → Reset to base canvas** and confirm (two-click). The mapping is deleted; the situation now renders with the base canvas.

## What provenance means

Each surface shows its provenance in every row and in the browse dialog:

| Signal | Values | What it means |
|---|---|---|
| **Provenance** | `first-party` / `community` | Who authored it — HyperIdle maintainers or a community contributor. |

Provenance is identity, not a gate. Before adopting a community surface, review its source — it runs in your app. Adoption itself is the trust signal: a deliberate team choice, version-pinned.

## What always works

The base canvas is always beneath every surface and is always the fallback:

- No adoption for a situation → the base canvas renders.
- Adopted surface fails to render → the base canvas renders; the examine pane shows a subtle "surface unavailable" note.
- You deleted an adoption → the base canvas renders immediately.

You never see a blank screen or a crash because of a surface.

## The "Rendered by" line

Inside a review, the examine pane shows a quiet status line:

```
Rendered by  stripe-refund-review @1.0.0  ·  first-party       [ Swap ▸ ]
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
