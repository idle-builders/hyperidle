# AJ7 — Annotator v2: devtools-style element inspector (concept)

**Level:** per-workpackage. Inherits the AJ5 annotation domain as a fixed input.

**One-line verdict:** AJ7 introduces **no new domain primitive.** The persisted domain
(`Annotation`, `Round`, `AnnotationTarget`, `AnnotationState`) is stable and reused
verbatim. What is new is an **interaction layer** — four UI concepts that sit *above*
the unchanged store: the **Highlight overlay**, the **Selection**, the **Notes panel
with re-highlight-on-hover**, and the optional **Ancestor breadcrumb**. This is a
dev-tool UX evolution of the AJ5 "review pill," not a reshape of what an annotation is.

---

## Required reading (downstream `/architecture` + `/pipeline`)

These are the load-bearing files. `/architecture` reads the plan, not docs directly — this is the list.

- `packages/design-system/viewer/annotations/annotation-overlay.tsx` — the AJ5 component being evolved (arm/hover/click/popover/notes-list). **Contains the known wiring bug** (see Rationale).
- `packages/design-system/viewer/annotations/resolve-component.ts` — `resolveComponentTarget(el) → { component, dsComponent, element }`. Reuse verbatim. Fiber-walk resolution chain.
- `packages/design-system/viewer/annotations/types.ts` — `AnnotationTarget`, `Annotation`, `Round`, `AnnotationState`, `AnnotationInput`. The persisted contract.
- `packages/design-system/viewer/annotations/annotation-store.ts` — `readState`/`appendAnnotation`/`startRound`/`renderMarkdown`. Server-side, unchanged.
- `packages/design-system/viewer/annotations/request-handler.ts` — GET/POST `/__annotations`, POST `/__annotations/round`. Body validation. Unchanged (one additive field — see Contracts).
- `packages/design-system/viewer/main.tsx` — how `AnnotationOverlay` is wired + the `storyRootRef` / `.demo-grid` story root + `isComponentPage` guard (keeps the overlay out of the snapshot net, AC10).
- `packages/design-system/viewer/viewer.css` — `.anno-*` styles (pill, popover, `.anno-hover`/`.anno-selected`/`.anno-saved` outline classes) + `--accent-primary`, `--surface-elevated`, `--shadow-elevated`, motion tokens.
- `plans/AJ5/retro.md` — AJ5 patterns: approved-design checklist at green, gitignored-state-+-tracked-artifact live-proof, dev-only-no-bundle.
- `/Users/tg/.claude/.../memory/project_annotator_vision_devtools.md` — founder vision (authoritative): devtools picker, re-highlight-on-hover preferred over pins, in-page (no extension).

---

## Phase 0 — The nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Annotation** | A saved note bound to a resolved element target, inside a round. | **Stable** (AJ5). Reused as-is. |
| **Round** | A numbered review pass; annotations accrue into the current open round; "New iteration" closes it. | **Stable** (AJ5). |
| **AnnotationTarget** | The resolved identity of an element: `{ component, dsComponent, element }`. | **Reshaped (additive only).** Gains an optional re-resolvable `anchor` so a note can re-find its element on hover. |
| **Highlight overlay** | The transient devtools-style box + floating label drawn over the currently-relevant element. | **New (interaction concept).** Not a domain primitive. |
| **Selection** | The single element the inspector has committed to (post-click), the subject of the in-progress comment. | **New (interaction concept).** |
| **Notes panel** | The list of saved annotations for the current round, each row re-highlighting its element on hover. | **New (interaction concept).** Evolves AJ5 `showList`. |
| **Ancestor breadcrumb** | An optional trail of ancestor elements (devtools "select parent") to widen/narrow the Selection. | **New (interaction concept), OPTIONAL.** |

Only the four interaction concepts + the additive `anchor` field enter the rest of this doc. The persisted domain nouns are inputs, untouched.

**Human design review forecast:** `Yes` — this is a novel UX shift from the pill to a devtools inspector. It hits the `/human-design-review` hard gate. (`/design` `DESIGN-CLASS` remains authoritative; it will classify `novel`.)

---

## Phase 1 — Essence of the new interaction concepts

### Highlight overlay

- **Identity.** A *transient, computed-fresh* visual layer — a box outline + a floating label — positioned over one element's bounding rect. It is a **view of an element's geometry at a moment**, never a stored object and never glued to the element. It is the same primitive whether driven by live hover (pick mode) or by note-row hover (re-highlight). One overlay concept, two trigger sources.
- **Essential properties.** (1) A target element (currently in the DOM). (2) A box matching `getBoundingClientRect()`. (3) A label showing the resolved component name + element descriptor. (4) Zero persistence — it exists only while a pointer is over a pickable element or a note row.
- **Rejection list.** It is NOT a pin (no glued marker, no stored x/y, no drift). It is NOT the `.anno-hover` *class on the story element* (AJ5 mutated the element's own `outline`; that pollutes the inspected DOM and can shift layout via `outline-offset`/`box-shadow`). The v2 overlay is a **separate, pointer-events-none layer element** positioned by JS — it never touches the inspected element's classList. It is NOT `.anno-saved` (there are no persistent on-canvas marks in v2 at all).
- **Composition.** Carries a resolved `AnnotationTarget` (for the label) and a `DOMRect` (for the box). Hosted by a fixed-position overlay root layered above the story canvas.
- **Lifecycle.** `hidden → shown(rect, label) → hidden`. Transitions: pointer enters a pickable element (pick mode) or a note row (re-highlight) → shown; pointer leaves / mode disarmed / element not found → hidden. Re-derived on each `mousemove`; no caching across frames.
- **Authority.** Owned by the inspector component (client, viewer-only). Geometry is read from the live DOM; never written back to it.
- **Vocabulary collision.** AJ5 calls element-level marks `.anno-hover`/`.anno-selected`/`.anno-saved`. v2's overlay is a distinct layer — keep the term **highlight overlay** for the layer; the AJ5 element-mutating classes are *retired* (see rejection list). No collision in `docs/`; "overlay" already exists as `AnnotationOverlay` (the React component) — the *component* keeps that name; the *visual concept* is "highlight overlay" (a child layer).

### Selection

- **Identity.** The single element the inspector has *committed to* by clicking — the subject of the comment being written. A pointer in space, not a stored thing (until saved as an Annotation).
- **Essential properties.** Exactly one element at a time (or none). Resolves to an `AnnotationTarget`. Drives the comment-input surface. Distinct from hover (hover is a candidate; selection is committed).
- **Rejection list.** Selection is NOT multi-select (one element, one comment — matches one-note-per-save). It is NOT the saved Annotation (selection is pre-save, ephemeral; saving converts it). It is NOT persisted — refresh loses an unsaved selection.
- **Composition.** Carries an `AnnotationTarget` + a reference to the live element (so the breadcrumb can widen/narrow and so the highlight overlay can frame it while the comment is open).
- **Lifecycle.** `none → selected(target, el) → (widen/narrow via breadcrumb mutates el+target) → saved(→Annotation) | cancelled(→none)`.
- **Authority.** Client/inspector. Source of truth for a *saved* selection is the store; the in-progress selection lives only in component state.
- **Vocabulary collision.** AJ5 already uses `selected` state + `.anno-selected`. Keep **Selection** as the concept; retire the element-mutating `.anno-selected` class in favor of the overlay layer (the selected element is framed by a *held* highlight overlay, not by mutating its outline).

### Notes panel (with re-highlight-on-hover)

- **Identity.** The list view of the current round's saved Annotations, where **hovering a row re-locates that annotation's element and draws the highlight overlay over it** — fresh, on demand. This is the founder's chosen model that sidesteps pin drift.
- **Essential properties.** (1) Lists the current round's annotations. (2) Each row shows the component/element it applied to + the note text. (3) Hovering a row triggers a re-resolve → highlight overlay (or a "not visible" state if the element can't be found). (4) Nothing it draws persists in the canvas.
- **Rejection list.** It is NOT a pin layer (the founder explicitly rejected glued pins — drift problem). It is NOT a cross-round history browser (scope: current round, like AJ5). It is NOT editable in place (no inline edit/delete in v2 — additive scope creep; defer).
- **Composition.** Reads `AnnotationState.rounds[current].annotations`. Each row carries the annotation's `target.anchor` (the re-resolvable descriptor) used to re-find the element.
- **Lifecycle.** `hidden → shown(list) → row-hover(re-highlight | not-visible) → hidden`. Panel open/close is user-toggled; re-highlight is per-row-hover.
- **Authority.** Reads from the store (middleware-owned). The panel mutates nothing in the store.
- **Vocabulary collision.** AJ5 `showList` is the embryo. Rename the *concept* to **Notes panel**; the AJ5 flat `.anno-list` is the starting CSS.

### Ancestor breadcrumb (OPTIONAL)

- **Identity.** A trail of the selected element's ancestors (story-root-bounded), letting the user widen the Selection to a parent or narrow back to a child — devtools "select parent."
- **Essential properties.** (1) Ordered ancestor chain from the selected element up to (not past) the story root. (2) Clicking a crumb re-points the Selection (and the held highlight overlay) to that ancestor. (3) Each crumb labeled by its resolved component/tag.
- **Rejection list.** It is NOT a full DOM tree explorer (no expand/collapse tree — a linear breadcrumb only). It does NOT cross the story-root boundary (never selects the viewer chrome, the overlay, or `document.body`). It is NOT required for v1 of AJ7 — it is the founder's named "nice-to-have."
- **Composition.** Derived from the selected element's `parentElement` chain ∩ within `storyRoot`. Each crumb carries a `{ el, target }`.
- **Lifecycle.** Exists only while a Selection exists. `none → chain(selected) → crumb-click(re-point Selection)`.
- **Authority.** Client/inspector; pure DOM read.
- **Vocabulary collision.** None in AJ5. "Breadcrumb" is unused elsewhere in the viewer.

---

## Phase 2 — Rejection list (concept-level decisions)

1. **No persistent in-canvas pins.** *Why:* a glued marker must track scroll/resize/re-render; the anchor drifts and breaks. The founder explicitly rejected pins. Re-highlight-on-hover computes geometry fresh, so there is nothing to drift.
2. **The inspector never mutates the inspected element's DOM/classList.** *Why:* AJ5's `.anno-hover`/`.anno-selected`/`.anno-saved` outline classes alter the story element's own box (outline-offset, box-shadow) — that perturbs the very layout under review and pollutes the DOM. v2 draws on a *separate overlay layer*. (Side benefit: keeps the snapshot net honest — the inspected DOM is untouched.)
3. **No Chrome extension / bookmarklet.** *Why:* the viewer renders components in its own same-origin document; we control the DOM. An extension is only needed for pages we don't control. In-page is simpler and the well-trodden pattern (LocatorJS / react-dev-inspector).
4. **No new domain primitive.** *Why:* annotation/round/target already exist and persist correctly. AJ7 is an *interaction* layer over the unchanged store. Inventing a primitive here would be over-engineering.
5. **No multi-select / batch-comment.** *Why:* one Annotation = one element + one note (matches the save contract). Multi-select would reshape the persisted contract for no proven need.
6. **No cross-round history UI in the panel.** *Why:* AJ5 scopes the notes list to the current round; widening to all rounds is scope creep and clutters the founder's review loop.

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **Highlight overlay** | Transient, computed-fresh box + label layer drawn over one element. Separate layer, never mutates the element. | pin, marker, highlight box (when meaning a glued thing), `.anno-hover` class |
| **Selection** | The single element committed to by click; subject of the in-progress comment. | selected node, picked element (as a stored thing), `.anno-selected` |
| **Pick mode** | The armed state where hover highlights and click selects. | arm, select mode (the *button* may say "Select", but the state is pick mode), inspect mode |
| **Notes panel** | List of current-round annotations; row-hover re-highlights. | notes list, `showList`, sidebar, drawer |
| **Re-highlight** | Re-resolving a saved annotation's element and drawing the overlay over it on row-hover. | re-pin, jump-to, locate |
| **Anchor** | The re-resolvable descriptor stored on a target so a note can re-find its element. | selector, path (alone), xpath |
| **Ancestor breadcrumb** | Linear trail of ancestors (story-root-bounded) to widen/narrow Selection. | DOM tree, element tree, outline |

Note: the React component stays named **`AnnotationOverlay`** (host of all the above). "Highlight overlay" is the *visual concept* it renders — distinct, no rename of the component required.

---

## Phase 4 — Contracts

- **Cardinality.** Exactly one Selection at a time (or zero). Exactly one Highlight overlay rendered at a time (driven by either live hover or one note-row hover; the two sources are mutually exclusive — re-highlight only fires when not in pick mode). Many annotations per round; one round open at a time (AJ5, unchanged).
- **Closure.** `AnnotationTarget` gains **one additive optional field** `anchor` (re-resolvable descriptor). The store/handler must accept-but-not-require it (back-compat with AJ5 annotations that have no anchor → their rows show "not visible" if hover-re-resolve fails). The persisted JSON shape stays a superset of AJ5.
- **Mutability.** Selection + highlight overlay are ephemeral client state — never persisted. Saved annotations stay **immutable** (AJ5 hard rule). Rounds immutable once closed.
- **Identity.** An Annotation keeps its opaque `id` (AJ5). The **anchor** identifies *where to re-draw*, not the annotation itself — a stable descriptor computed from the story root (e.g. structural path + component name + element descriptor), re-resolvable best-effort; if it doesn't resolve, the row is honestly "not visible," never broken.
- **Hard rules.**
  1. **The inspector never mutates the inspected element's DOM or classList.** All visual feedback is on a separate, `pointer-events:none` overlay layer. (If violated, v2 has regressed to AJ5's DOM-polluting model.)
  2. **No persisted geometry.** Nothing stores pixel coordinates; the overlay box is always `getBoundingClientRect()` at hover time. (If violated, the pin-drift problem the founder rejected is back.)
  3. **The overlay never enters the snapshot net.** It renders only on a component page (`isComponentPage` guard, AJ5 AC10) and never inside a story render. (If violated, every `.snap` churns.)
  4. **Dev-only.** Lives only in the `:8098` Vite viewer; never in a production bundle (AJ5 lore).
  5. **Anchor is best-effort, never load-bearing for correctness.** A missing/failed anchor degrades to "not visible," never an error or a crash.

---

## Phase 6 — Self-critique

- *Is the rejection list distinct?* Yes — pins, DOM-mutation, extension, primitive-invention, multi-select, cross-round are six genuinely different rejections, each with a load-bearing reason.
- *Does "Highlight overlay" collide?* The React component is `AnnotationOverlay`; the visual concept is "highlight overlay" (a child layer). Distinct roles, documented. `grep` of `viewer/` shows `.anno-*` classes — v2 retires the element-mutating ones and adds layer-level classes; no silent collision.
- *Are contracts complete?* Cardinality (1 selection / 1 overlay / many annotations) ✓, closure (additive `anchor`, superset JSON) ✓, mutability (ephemeral vs immutable) ✓, identity (id vs anchor split) ✓, hard rules (5, each falsifiable) ✓.
- *Is the rationale concrete?* Yes — cites the founder's explicit pin-rejection (drift), the AJ5 DOM-mutation pollution, and the snapshot-net constraint.
- *Right files touched?* Concept lives in `plans/AJ7/concept.md`. No `docs/` ground-truth change is warranted — the annotator is a dev-tool, not a product primitive; AJ5 did not create a `docs/<topic>` entry either. The essence lands in code + this plan; `/write-docs` later decides if any `docs/ui-design` note is warranted.

---

## Rationale

AJ5 shipped a narrower design than the founder wanted: a fixed-to-pill popover (never anchored to
the element), no live hover box, no tree navigation, saved notes shown only as a flat list + an
element outline. The founder's real model is a **browser-devtools element picker** — hover to
highlight, click to select, comment — with **re-highlight-on-hover from the notes panel** as the
deliberate alternative to glued pins (which drift on scroll/resize/re-render). AJ7 keeps the entire
AJ5 *persistence* domain (it works and is proven by AJ5's live-proof) and rebuilds only the
*interaction* surface on top of it.

The current AJ5 overlay is additionally **broken**: `main.tsx` passes `storyRoot={storyRootRef.current}`,
which is `null` on the render that mounts `AnnotationOverlay` (a ref's `.current` is null during that
render; mutating a ref does not re-render the parent). So `arm()` hits its `if (!storyRoot) return`
guard and attaches no listeners — selection does nothing. AJ7 must fix this wiring (callback-ref →
state, so the overlay re-renders once the story root element exists). This is an architecture concern,
flagged here so it is not lost.

The one persisted change AJ7 commits to is an **additive optional `anchor`** on `AnnotationTarget`,
so a note can re-find its element on hover. Everything else — the highlight overlay, selection,
notes-panel re-highlight, ancestor breadcrumb — is ephemeral client interaction over the unchanged
store. No new domain primitive; a dev-tool UX evolution.
