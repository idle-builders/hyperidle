# AZ20 — Knowledge navigator

## Work package

**Outcome.** A person can browse, search and open the knowledge structure directly in the sidebar navigator, including deep document sets that cannot be represented by a tiny recent-items list.

**Why this matters.** Knowledge navigation is structural rather than merely recent. A five-item head list hides most of the information architecture; sending the user to a separate list for every browse makes the sidebar decorative instead of useful.

**What exists today.** AZ13 preserves a provisional five-row Knowledge list. The main Knowledge surface owns the larger triage/relevance list and document access, while the backend does not yet expose a canonical cross-scope tree.

**Missing delta.** A Knowledge-specific navigation model—tree, grouped list or another approved structure—with canonical order, scope behavior, controls and a truthful data contract; plus retirement of redundant list navigation if equivalent access is proven.

**Depends on.** AZ13 — the stable domain switcher and dynamic navigator region must exist before Knowledge can own that region.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Refinement and design required. The hierarchy/scope noun and its data source are unresolved, and tree behavior on phone needs a deliberate model.

**Constraints.** Do not invent hierarchy from incidental result order. The navigator and any remaining Knowledge list must share one canonical ordering contract. Preserve full titles and keyboard tree/list semantics.

**Out of scope.** Knowledge document editing, lifecycle-policy changes and unrelated knowledge-generation workflows.

## Acceptance criteria

- The Knowledge destination exposes a scalable browse structure that can reach the intended document set without an arbitrary two- or five-item ceiling.
- Scope, ordering and hierarchy are backed by an explicit canonical data contract and remain understandable and keyboard-operable at desktop and phone widths.
- Search/filter/group controls selected in design operate within the navigator, and any redundant Knowledge list is retired only after its retained journeys remain reachable.
- Responsive behavior is explicitly designed and validated for both the fixed desktop sidebar and the mobile drawer.

## Validation scenarios

- Given a deep knowledge collection, when the user navigates through its structure, then they can reach a non-recent document without opening an intermediate full-list page.
- Given long document titles and nested structure on phone, when the drawer is open, then labels remain recoverable and expanding or moving through the structure does not lose context.
