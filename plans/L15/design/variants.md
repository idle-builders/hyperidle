# L15 — Design variant exploration

## Surface inventory

The task card lives in `packages/design-system/src/TaskCard.tsx` (Tier 2). It already exposes a `actions?: ReactNode` slot (line 16) and an `onClick` slot. We do NOT modify TaskCard's internal markup — we drive the affordance through the existing `actions` slot or with a sibling overlay control inside `Kanban.tsx`.

Constraints framed by the spec + AESTHETICS rules:
- 19-component budget — no new component family.
- Density: kanban columns are narrow (~280-320px). The affordance must NOT inflate the per-card height in the resting state. Hover/focus is the natural reveal trigger; mobile (no hover) needs a visible tap target ≥ 44px.
- One interaction grammar — Approve/Reject/Request Changes/Snooze is the universal verdict set. We are NOT introducing a parallel set; Requests are deliberately fire-and-forget (concept §Authority).
- The intent set is **closed**: a fixed list of state intents (block / unblock / done / kill / hold) plus "open thread". Free-form prose is optional, never required.

## Variant A — Inline kebab menu via TaskCard `actions` slot

A "···" trigger lives in the existing `actions` slot at the bottom-right of the card. Clicking opens a DaisyUI `dropdown-content` aligned to end. Items:

```
Open thread
─────────────
Request: move to BLOCKED
Request: unblock and resume
Request: mark DONE
Request: put on HOLD
Request: stop (kill)
─────────────
Add a note...      (opens a small composer dialog)
```

Each request item posts immediately on click (with optimistic toast). "Add a note..." opens a Composer (existing `Composer` design-system component) preconfigured with the same intent options as a select + a free-form textarea, then submits.

**Pros.** Uses the existing `actions` slot without modifying TaskCard. DaisyUI dropdown is keyboard-navigable for free (`menu` role, arrow keys via roving focus already in use). Compact at rest. Works on mobile (tap-to-toggle).

**Cons.** Two-step interaction for every action (open menu → pick item). Discoverability of "···" depends on hover affordance; on touch, tap on "···" is needed. Six items is borderline busy.

## Variant B — Header strip with split button

A thin one-line strip rendered above the card body (inside a wrapper div in Kanban; TaskCard untouched) with two controls:

```
┌──────────────────────────────────────────────────┐
│  [ Request ▾ ]   [ Open thread ]                 │
├──────────────────────────────────────────────────┤
│  Title                                           │
│  Owner · Status · Cost                           │
└──────────────────────────────────────────────────┘
```

`Request ▾` opens a small popover with the same closed list; `Open thread` is a direct navigation. The strip is hidden until hover/focus on the card or its descendants, with `:focus-within` keeping it pinned during keyboard navigation.

**Pros.** Both top-tier intents (request, open thread) reachable in one click each (well, one click + one for request submenu). Visually telegraphs that the card has agent-side intents.

**Cons.** Adds chrome above every card → reads heavier. Two affordances at top of card competes with the card title for the eye. On touch with no hover, the strip needs to either always-show (busy at rest) or open on long-press (non-standard).

## Variant C — Card itself becomes the trigger; sheet-style detail surface

The whole card becomes clickable (`onClick` slot already exists). Clicking opens a side sheet (DaisyUI drawer-end, full-height, ~360px wide on desktop; bottom sheet on mobile) showing:

- Task summary (title, owner, state, cost, betTag) at top.
- A "Request" section with the closed list as a vertical button column with a single shared free-form note textarea below.
- An "Open thread" link at the very top of the sheet that swaps the sheet content to inline thread reader (the same primitive L18 will mount on Bet detail).

**Pros.** Single-click discoverability — the card already wants to be clickable. The sheet doubles as the eventual L18 attached-thread surface for tasks (when L18 lands the sheet's "Open thread" content path becomes fuller). A sheet is the canonical "show me more about this row" pattern. Free-form note has prominent space.

**Cons.** Heavier interaction (overlay covers context). New routing surface required (open/close state) — though Submenu/Drawer machinery exists in the shell. If L18 isn't shipped yet, the sheet's "open thread" content path needs a stub (read-only thread list with "view in Conversations" link) until it is.

---

## Scoring (9-dimension rubric, 0–10)

| Dim | A — Kebab | B — Header strip | C — Sheet |
|---|---|---|---|
| Hierarchy (the right thing reads first) | 8 — title still wins | 5 — top strip competes with title | 9 — at-rest = title; on click = sheet's own hierarchy |
| Spacing & density | 9 — 0px overhead at rest | 5 — adds a row to every card | 9 — 0px overhead at rest |
| Typography (no off-scale) | 9 — DaisyUI menu inherits | 8 — Tag/Button reused | 9 — sheet uses tokens |
| Color (Lucid, no AI tells) | 9 — neutral chrome | 7 — strip likely needs muted bg | 9 — sheet uses --surface-2 |
| Coherence (with the rest of the app) | 9 — kebab is already on Bet/Knowledge surfaces (precedent) | 6 — no precedent for a card-top action strip | 8 — drawer pattern matches PitchSelector overlay precedent |
| States (empty/loading/error/populated) | 7 — empty thread case + post-failure toast both possible inside menu | 7 — same | 9 — sheet has clear room for loading/error states inline |
| Accessibility | 8 — DaisyUI dropdown role=menu, keyboard arrows | 8 — buttons and popover both a11y | 9 — drawer is dialog-shaped, focus trap + ESC handled by DaisyUI primitive |
| Anti-slop / no AI tells | 9 — kebab is the boring, correct choice | 7 — header strip risks a "card with wings" look | 8 — drawer is fine; sheet content must avoid hero-card slop |
| Premium polish (feels purposeful) | 8 — efficient power-user vibe | 6 — adds chrome that doesn't earn its space | 9 — single-click discoverability + room to grow into L18 |
| **Total / 90** | **76** | **59** | **79** |

## Pick — **Variant C (Sheet)** — with one caveat

C scores highest on Hierarchy, States, A11y, and Premium polish; equal-best on Spacing and Color; and notably grows into L18's attached-thread surface for tasks without throwing work away. The "open thread" affordance the L15 spec demands is exactly the inline thread reader L18 will produce — Variant C is the only variant where they're the same surface.

**Caveat.** L18 hasn't shipped. Variant C must specify a graceful intermediate where the sheet's "Open thread" path opens the thread in the existing `ConversationsChat` page (or a navigation to it) rather than rendering inline. The architecture phase pins this down.

**Why not A?** A is fine but trades growth (becomes L18 with no rework) for a marginal density win at rest. The sheet's overhead at rest is ZERO too — both are zero-chrome until invoked.

**Why not B?** Adds chrome that doesn't earn its space. Lowest score across hierarchy + spacing + coherence.
