# AL5 — Design: the adopt/browse surface (one routine variant)

**DESIGN-CLASS: routine**

> Rationale (echoes the locked concept §Phase 0 forecast). The review-**rendering** side introduces **no new screen** — an adopted surface fills the *exact* slot the base canvas already occupies inside `ReviewComposition` (the `<Canvas artifact={…}/>` / `ReviewActionOperation` site in `ExaminePane`). The only genuinely new pixels are (1) the **adopt/browse** management surface and (2) a one-line **"rendered by X · swap"** affordance inside the review's examine pane. Both are list+provenance+trust-tier+pick patterns that already exist in `SettingsConnections.tsx` (AN1). No new primitive, no new interaction model → routine. Per the no-skeleton/error-in-initial-designs memory, this spec describes only the **populated real state**; loading/empty/error are deferred to the builder. No base canvas and no specific surface's content is designed here (author-owned).

---

## What the user is deciding

The team owner is making **one decision**: *for this review situation (a tool/task), which review surface renders it?* Everything on the surface serves that: see what's available, see who wrote it + how trusted, preview it against sample data, commit the choice. It is the AN1 Connections decision shape (a catalog of availables → an owned, reviewable choice) applied to review surfaces.

Two entry points, one decision:
1. **Settings → Review surfaces** (the management surface) — the deliberate browse/adopt/swap home, mirroring Settings → Connections.
2. **In-review "rendered by X · swap"** — the contextual shortcut: while reviewing, the reviewer sees which surface rendered the open artifact and can jump straight to swapping it.

---

## Surface 1 — Settings → Review surfaces (the management surface)

Reuses the `SettingsConnections` skeleton verbatim in shape: page header + `Button` ("Browse registry"), then **grouped `ItemList`s of `Row`s**. Two groups, fixed order:

- **Adopted** — the deployment's committed `(situation → surface)` mappings. The active set. Each row = one adoption.
- **Available (not adopted)** — surfaces present in the configured registries that no situation currently uses. The catalog-of-availables, browsable.

### Adopted row anatomy (the `Row` primitive, AN1 pattern)

| Slot | Content |
|---|---|
| `lead` | `ToolLogo` for the situation's tool (reuse `packages/web/src/pages/review/ToolLogo.tsx`), falling back to a 2-char monogram mark (AN1 `ServiceMark`). |
| `title` | The **situation** label — `Stripe · refund` (`<tool> · <task/kind>`) + a `TrustTag` (vetted dot / `Community` `Tag`, reuse AN1 inline `TrustTag`). |
| `subtitle` | `<surface name> @ <version>` · `<provenance>` — e.g. `stripe-refund-review @1.2.0 · First-party`. Provenance string is server-built (mirrors AN1 `via`), never a raw URL. |
| `cells` | base-canvas name, neutral tone — `wraps action_operation` (or `ejects …`). One cell, ~120px. |
| `actions` | `StatusChip` carrying **resolution health** (`Active` healthy / `Pinned version missing` error / `Base — no surface adopted` neutral). Then a `⋯` `Menu`: **Preview**, **Swap…**, **Reset to base canvas** (destructive, two-click confirm — reuse AN1 confirm pattern). |

### Available row anatomy

Same `Row`, minus the situation-binding: `title` = surface name + `TrustTag`; `subtitle` = `wraps <base> · <provenance> @ <version>`; `cells` = adoption count across known situations (or `—`); `actions` = `Preview` + **Adopt…** (`Button size="sm"`).

### The base-canvas floor, made visible (not an empty state)

A situation with **no adoption** is the floor, and that is the correct, common, *populated* state — not absence. The Adopted group shows these explicitly as **`Base — <base canvas> (floor)`** rows with a neutral `StatusChip`, so "this renders with the generic canvas, on purpose" is legible and one click (`Adopt…`) from change. This is the design answer to concept hard-rule #3 (the floor is always present and answerable), and it keeps the surface populated without inventing a skeleton/empty treatment.

### Browse / Adopt dialog (`Dialog`, AN1 `AddConnectionDialog` shape)

Opened by "Browse registry" or a row's `Adopt…` / `Swap…`. Single `Dialog`, `size="lg"`:

- **Left** — a filterable `ItemList` of available surfaces for the (optionally pre-filled) situation: each `Row` = name + `TrustTag` + base-canvas cell + provenance. Selecting one drives the right pane. (Filter by tool/base canvas via a `Select`.)
- **Right — preview.** Renders the **selected surface's `.stories.tsx` default against its manifest's bundled sample fixture**, inside an `<iframe>` pointed at the existing `:8098` TSX viewer story URL (concept §Phase 0: "reuses the existing `:8098` TSX viewer for preview"). This is the load-bearing trust affordance: *you see exactly what you'd adopt before committing it.* Above the preview: provenance line + trust tier + base canvas + a `wrap`/`eject` chip.
- **Footer** — `Cancel` + **Adopt for `<situation>`** (`Button variant="primary"`). Adopt pins the surface **version** shown. On adopt the dialog closes and the Adopted group refreshes — exactly AN1's `onAdded → reload`.

`Swap…` is Adopt with the situation pre-bound and the current surface highlighted; choosing a different one re-points the same mapping (and re-pins the new version).

### Keyboard & focus

`Esc` closes the dialog (reuse the `ReviewComposition` Escape handler convention). Arrow-keys move the left-list selection, updating the right preview. Focus returns to the triggering row's `⋯`/`Adopt` button on close. Confirm-to-reset mirrors AN1 two-click.

---

## Surface 2 — In-review "rendered by X · swap" affordance

The examine pane (`ExaminePane` in `ReviewComposition.tsx`) already has a header row with `KindBadge` + `ToolLogo` + title + "Comment on this" + close. Add **one quiet line beneath that header bar** (or a trailing chip in it):

```
Rendered by  stripe-refund-review @1.2.0  ·  First-party · vetted        [ Swap ▸ ]
```

- A small `Tag`/text chip: **"Rendered by `<surface name>` @`<version>`"** when an adopted surface rendered the artifact; **"Base canvas (`<base>`)"** when the floor rendered it (no adoption, or the adopted surface failed to load — and in the failure case append a subtle `· surface unavailable` note in `--status-warning`, so the silent-degrade is *visible*, satisfying "which surface rendered this is always answerable").
- **`Swap ▸`** opens the Browse/Adopt dialog (Surface 1) pre-bound to this situation. After adopting, the examine pane re-resolves and re-renders with the new surface. This is the only state change the affordance triggers — it never touches the verdict, staged action, or gate (concept hard-rule #5). It is a presentation control, sited next to "Comment on this".

This single line is the entire new in-review chrome. It costs one row of the existing header; it adds no panel, no tab, no mode.

---

## Why one variant is right (the routine justification)

There is no layout fork to explore: the management surface is an instance of the AN1 Connections list (a solved, founder-approved pattern — list grouped by status, per-row trust tier + provenance + overflow menu, header add-button, add-dialog), and the in-review affordance is one line in an existing header. Multi-variant exploration would re-litigate AN1's already-approved IA for no new decision. The concept's forecast (`/design` skippable; adopt surface routine) is confirmed: **routine**, one variant, no human-design-review. If the reviewer's `/design-critique` re-classes it `novel`, the human-design-review gate fires regardless.

## Component budget

Zero new design-system components. Composed entirely from catalogued primitives already used by `SettingsConnections`: `Row`, `ItemList`, `SectionLabel`, `StatusChip`, `Tag`, `Button`, `Dialog`, `Select`, `Menu`. Inline single-use shapes (`ServiceMark`, `TrustTag`) are reused/duplicated per the AN1 `@lore NIT-4` convention (not promoted). The preview `<iframe>` to `:8098` is not a component — it is the existing viewer.

## States deferred to the builder (not designed here)

Loading (registry fetch in flight), empty (no registries configured), error (registry unreachable, preview story missing). The populated real state above is the design baseline; the `.stories.tsx` renders it.
