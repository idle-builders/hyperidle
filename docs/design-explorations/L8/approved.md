# L8 — Conversations Submenu thread sections — APPROVED design

**Story:** TRACK-L L8 (lines 269–294). **Status:** approved input contract for `/architecture`.

**Chosen variant:** **C — Blocking / Active / Resolved**, with host-tag pill from A and sticky-header / opacity-treatment from B.

**Mockup:** `variant-c-blocking-active-resolved/mockup.html` + `screenshot.png`.

**Critique score:** 9.0/10. Threshold (≥7) cleared.

---

## 1. User contract

A founder lands on Conversations and asks three questions in this order. The Submenu answers each:

1. *"Is anything blocking right now?"* → **Blocking** section (red-tinted header, sticky, count = blocking-thread count). Empty Blocking = silently absent (good news; no chrome wasted). Non-empty Blocking = always visible during scroll.
2. *"What do I work next?"* → **Active** section. Pinned coach floats at top (pin glyph). Blocking-but-still-active threads do not appear here — they are in Blocking.
3. *"Did my recent verdicts land?"* → **Resolved · 24h** section. Rows render at 70% opacity ("behind glass"). Empty Resolved = silently absent.

Selection of a row drives a **lifted selected-thread id** on AppShell. The Main pane reads the id and renders the thread. **No route navigation.**

---

## 2. Sections — names, ordering, sort rules

**Section vocabulary (closed, in render order):**

| Index | Section id | Label | Header tone | Sticky | Empty handling |
|---|---|---|---|---|---|
| 1 | `blocking` | `Blocking` | danger-tinted (`color-mix(in oklab, var(--danger) 10%, var(--surface-1))`); 3px left-edge danger accent; danger-colored label and count | yes (when present) | silently absent |
| 2 | `active` | `Active` | neutral (mono uppercase tracking-wider, `var(--text-lo)`) | no | header renders + muted `Quiet — nothing in flight.` |
| 3 | `resolved` | `Resolved · 24h` | neutral; the `· 24h` suffix is part of the static label | no | silently absent |

> The `pinned`, `reviews`, `chats` section ids in the existing `ThreadSections.tsx` are **deprecated** for the Conversations Submenu. The architect either:
> (a) extends the existing classifier with a Conversations-specific mode that returns only `blocking | active | resolved`, OR
> (b) replaces the section enum entirely.
> Either is acceptable. The visual contract is the three sections above.

**Classification rule (per thread, exhaustive):**

```
if thread.resolvedAt && (now - thread.resolvedAt) <= 24h: resolved
else if thread.blocking:                                  blocking
else:                                                     active
```

`blocking` is the L1-derived flag (HIL §4.5.5). `resolvedAt > 24h ago` re-enters Active *only if `blocking` is false*; otherwise it's blocking (a re-opened blocked thread). The architect picks the storage but the rule is exhaustive.

**Sort within each section:**

- **Blocking** — `lastActiveAt` desc. (Pinned coach cannot be blocking — coach threads are not on agents waiting on the user; brief Q1.)
- **Active** — `pinned` desc → `hasUnresolvedReview` desc → `lastActiveAt` desc. So pinned coach is row 1; threads with an unresolved review (the founder's "should-look") cluster next; chats trail.
- **Resolved** — `resolvedAt` desc.

**Section appearance order:** always Blocking → Active → Resolved. Empty sections per the table above.

---

## 3. Counts

- **Total count** (in Submenu title bar, existing chrome): sum of *visible* threads across all three sections after filter chips apply. Derived; never literal.
- **Per-section count**: `bucket.length` for the section. Derived; never literal.
- **Format**: bare digit. Mono font. `var(--text-lo)` color (Active/Resolved). `var(--danger)` color (Blocking).
- **Position**: immediately right of the section label, `0.5rem` gap.
- **Hard rule**: counts must equal the rendered list length. If a count differs from the row count by even one, it is a bug — not a design tolerance.

---

## 4. Thread rows

**Component**: `ThreadRow` from `@hyperidle/design-system`.

**New props the architect must add to `ThreadRow`:**

- `selected?: boolean` — adds `thread-row--selected` class. Visual: `background: var(--surface-4)` + `border-left: 2px solid var(--primary)`.
- `pinned?: boolean` — adds the pin glyph (10px SVG, color `var(--text-mid)`) before the title. Render order: avatar → pin glyph → title. The glyph is the SVG path `M6 1l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L1 4.5l3.5-.5L6 1z` in a 12×12 viewBox. `aria-label="Pinned"` on the SVG.
- `hostTag?: string` — adds a small mono pill at the right of the title: `bet | task | knowledge | coach | factory | artifact | agent | user | team`. Maps from `host_kind`. Visual: same as existing `Tag` component (`var(--surface-ghost)` background, `var(--text-mid)` text, mono 10px).

**Selected-state stacking with blocking left-border:** when a row is both `blocking` and `selected`, the **primary** border wins. The row's `BLOCKED` StatusChip (right of title) and the row's position-within-`Blocking`-section both still convey the blocking state. (The `thread-row--selected` CSS class overrides `thread-row--blocking`'s `border-left` value.)

**Resolved-state visual:** the `resolved` section applies `opacity: 0.7` to all rows inside it (CSS class `thread-row--resolved` or selector `.section--resolved .thread-row`). This is the "behind glass" treatment.

**Row content order** (left to right):
- 32px avatar (`--density-avatar-size`).
- Body column:
  - Header line: `[pin glyph?] title [host pill] [status chip?]`.
  - Snippet line.
- Right gutter: timestamp.

**Interaction:**
- Click → `onSelect(thread.id)`.
- `Enter`/`Space` while focused → `onSelect(thread.id)`.
- `Up`/`Down` arrow → moves focus within the Submenu list (a11y standard; allowed by founder filter).
- Hover → existing `--surface-4` background.
- Selected → as above.

---

## 5. States

### 5.1 Empty (whole list, no threads from server)
Render `EmptyState` component in the list slot. The Submenu title bar + filter chips remain.
- **title:** `No threads yet`
- **description:** `Conversations with agents will appear here once started.`
- **dataTestId:** `thread-sections-empty`

### 5.2 Loading
Render 3 skeleton rows in the list slot using the existing `Skeleton` component. No section headers during loading. The title bar's total count shows nothing (or a skeleton chip).

### 5.3 Error
Render `ErrorState` component in the list slot. The Submenu title bar + filter chips remain.
- **title:** `Couldn't load threads`
- **description:** `Check your connection and try again.`
- **action:** retry button labeled `Retry`. Clicking re-runs the L1 query.
- **dataTestId:** `thread-sections-error`

### 5.4 Populated
Sections render in fixed order per §2. Empty-section rules per the table.

### 5.5 Per-section empties
- **Blocking empty:** section silently absent.
- **Active empty:** section header renders with count `0`. Below it, single muted line: `Quiet — nothing in flight.` (`var(--text-lo)`, 12px, `8px 12px` padding). `dataTestId="thread-section-active-quiet"`.
- **Resolved empty:** section silently absent.

### 5.6 Overflow
Submenu list slot scrolls (`overflow-y: auto`). The Blocking section header is `position: sticky; top: 0; z-index: 2;` when the section is present. The Active and Resolved headers are not sticky. Section header backgrounds match `var(--surface-1)` so scrolling content does not bleed through.

### 5.7 Selected-thread state
At most one row across the entire Submenu carries `selected={true}`. When the lifted id is `null`, no row is selected. When a thread is deleted server-side and the lifted id no longer matches any row, the Submenu shows no selection (the Main pane handles its own "thread not found" state — out of L8 scope).

---

## 6. Filter chips × grouping

The existing filter chips (`All / Needs review / Chats / Resolved`) are J2-locked. They filter the list **before** sectioning:

| Chip | Filter rule | Sections that can render |
|---|---|---|
| `All` (default) | no filter | Blocking, Active, Resolved |
| `Needs review` | `hasUnresolvedReview = true` | Blocking, Active (no Resolved — a resolved review is no longer "needs review") |
| `Chats` | `hasUnresolvedReview = false` | Blocking (rare — a blocking chat), Active, Resolved |
| `Resolved` | `resolvedAt` within 24h | Resolved only |

When a filter empties Blocking, Blocking section silently absents (per §5.5). When a filter empties Active under `Needs review`, Active still shows its header + Quiet line (per §5.5).

Selecting a filter chip resets nothing about the lifted selected-thread id. If the selected thread is filtered out, no row is selected; the Main pane keeps showing the thread (the user can clear the filter to bring the row back into view).

---

## 7. Mobile adaptation

- The mobile Conversations tab renders the Submenu as the page content (no separate IconRail/Submenu split on mobile).
- The Submenu's title bar (`Conversations 9` + collapse chevron) becomes the mobile screen header.
- Filter chips remain horizontally above the list.
- 3 sections at 360px width fits comfortably.
- **Sticky Blocking header on mobile is critical.** Phones are where the founder picks up after lunch; the danger signal must remain anchored on long Active scrolls.
- All density tokens auto-tier to `comfortable` at viewport ≤1024px (existing AppShell behavior).

---

## 8. Accessibility

- Section labels are `<h3>` headings (existing pattern in `ThreadSections.tsx`).
- Each `ThreadRow` is `role="button"` with `tabindex={0}` (existing).
- Selected row carries `aria-current="true"` (architect adds).
- Pin glyph SVG carries `aria-label="Pinned"`.
- The danger-colored Blocking section header text clears WCAG 2.1 AA on the 10% danger-tinted surface (architect verifies in both Lucid Dark and Lucid Light per AESTHETICS.md AQ-010).
- Color is **not the only** signal for the Blocking section: the label text `Blocking` and the row-level `BLOCKED` StatusChip carry the meaning equally. Color-blind-safe.
- Up/Down arrow navigation moves focus within the list. No keyboard verb shortcuts (founder filter).

---

## 9. Component composition map

| Surface | Component | Source | Notes |
|---|---|---|---|
| Submenu chrome (title, count, filter chips, collapse) | `Submenu` | `packages/web/src/shell/Submenu.tsx` | unchanged |
| List slot | `ThreadSections` (extended) | `packages/web/src/components/ThreadSections.tsx` | architect refactors classifier to `blocking / active / resolved`, retains `groupThreadsIntoSections` shape |
| Section header | inline JSX inside `ThreadSections` | — | gains `tone: 'danger' | 'neutral'` variant |
| Row | `ThreadRow` | `packages/design-system/src/ThreadRow.tsx` | gains `selected`, `pinned`, `hostTag` props (all optional) |
| Empty (whole list) | `EmptyState` | design-system | unchanged |
| Error | `ErrorState` | design-system | unchanged |
| Loading | `Skeleton` | design-system | unchanged |
| Pin glyph | inline SVG | inside `ThreadRow` | new |

**Component budget impact:** zero new components. `ThreadRow` gains props; `ThreadSections` (already a custom component in `packages/web/src/components`) gains a section-header tone variant. No Tier 1/2/3 budget change.

---

## 10. Founder filter — verification

- [x] No keyboard verb shortcuts (Up/Down arrow only, a11y standard).
- [x] No emojis (pin is SVG glyph; no reactions; section labels are plain words).
- [x] Counts derive from list length (no literals).
- [x] Selection drives lifted id, not route navigation.
- [x] No drag-to-reorder.
- [x] No customizable section sets.
- [x] No 3-column card grid; no hero; no purple/indigo gradient.
- [x] Density tokens consumed throughout.
- [x] Closed radius scale only.

---

## 11. Open questions for the architect (data shape, route, action endpoints)

1. **L1 query placement.** Should the threads query subscribe at the AppShell level (so the Submenu reads `threads` directly and the Main pane reads the same store) or at a Conversations layout level? Recommend: AppShell level so the Submenu count and list never desync.
2. **Lifted-id plumbing.** Local state in AppShell, URL search param (`?thread=<id>`), or Zustand? The visual contract is satisfied by all three. Recommend: URL search param so deep-links work from the Rail and notifications.
3. **`ThreadItem` shape vs L1 store row.** The existing `ThreadItem` interface (`ThreadSections.tsx:15-30`) carries `hasUnresolvedReview`, `pinned`, `blocking`, `resolvedAt` — fields that may be derived from the L1 messages array. Where does derivation live? In the L1 store (server-side) or in the Conversations selector (client-side)? The architect picks; the visual contract is unchanged either way.
4. **Empty-section animation.** When the first blocking thread arrives in real time, does the Blocking section appear with a 80ms opacity fade or instantly? Designer-call: 80ms fade is the right default but the architect can ship instant if WebSocket reconciliation makes the fade glitchy.
5. **Resolved 24h boundary.** Does `now` re-evaluate on every render or on focus/visibility-change? Designer-call: a thread that resolved 23h59m ago should *not* drop out mid-session as the user watches. Recommend: cache `now` per render frame, accept the very rare 24h boundary flicker.
6. **Selected-thread persistence across view switches.** When the user switches IconRail to Work then back to Conversations, is the lifted id preserved or cleared? Designer-call: preserved. The founder shouldn't lose their place.

---

## 12. Acceptance criteria mapping (TRACK-L L8)

| AC | Where in this design |
|---|---|
| Submenu renders the full thread list from L1 store | §1, §9 |
| Static entries removed from `AppShell.tsx:39-44` | architect implements; this design has no static entries |
| Hardcoded counts at `:40-41` removed | §3 — counts derive |
| Sections grouped sensibly | §2 |
| Selection drives lifted id, not route nav | §1, §11 Q2 |
| Section counts derived from fetched list | §3 |
| Vitest covers empty/mixed/selection | §5 + §1 — provides the contract; architect writes tests |
| Playwright e2e: list loads, click updates main pane, counts match | §1, §3 |
| L6 inventory rows closed | architect closes |
| `bun run check` + `bun run lint` + `bun run test` green | architect verifies |
| Counts match list length | §3 — hard rule |
| No keyboard verb shortcuts | §10 |
| No emojis | §10 |
