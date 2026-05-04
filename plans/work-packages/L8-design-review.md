# L8 — Design review

**Story:** TRACK-L L8 (lines 269–294). **Branch:** `feat/L8-conversations-submenu-threads` (worktree `/workspace/.worktrees/L8`). **Reviewer mode:** read-only.

**Inputs:**
- Spec: `docs/work-packages/TRACK-L.md` lines 269–294.
- Approved design: `/workspace/.worktrees/L8/plans/design-explorations/L8/approved.md` (Variant C — Blocking / Active / Resolved, 9.0/10).
- Reference HTML mockup: `/workspace/.worktrees/L8/plans/design-explorations/L8/variant-c-blocking-active-resolved/mockup.html`.
- Implementation:
  - `/workspace/.worktrees/L8/packages/web/src/components/ThreadSections.tsx`
  - `/workspace/.worktrees/L8/packages/web/src/layouts/AppShell.tsx`
  - `/workspace/.worktrees/L8/packages/design-system/src/ThreadRow.tsx`
- Screenshots taken from the dev server at `http://localhost:5191/designsystem` (route `/conversations/review` blocked behind a server that requires DB migrations; populated/empty/error/quiet rendered from stories).

**Visual evidence:** `/tmp/L8-threadsections.png`, `/tmp/L8-populated-zoom.png`, `/tmp/L8-review.png`.

---

## Summary

| Severity | Count |
|---|---|
| Blocking | **3** |
| Major | **2** |
| Minor | **2** |
| Design-lint violations on changed files | **0** |
| Total | **7** |

Visual parity with the mockup fails the ≤5% pixel-diff bar. The Blocking section header is missing both signature visual treatments (tinted band + 3px left-edge accent), the header is not sticky, and the host pill diverges from the spec's mono-10px form. Section names, copy, and selection / pinned mechanics are correct. No design-lint regressions on the L8-changed files (`ThreadSections.tsx`, `AppShell.tsx`, `ThreadRow.tsx`, `useConversationsThreads.ts`).

---

## Findings

### B1 — [BLOCKING] Blocking section header is missing the danger-tinted band and 3px left-edge accent

**Spec:** approved.md §2 / §5.6. Mockup CSS:
```css
.section--blocking .section__header {
  background: color-mix(in oklab, var(--danger) 10%, var(--surface-1));
  border-left: 3px solid var(--danger);
  border-radius: var(--r1);
  margin-bottom: 4px;
}
```
**Code (`ThreadSections.tsx:160-168`):** the header is a plain `<h3>` with `text-[var(--danger)]` only — no background, no left-edge accent. The red signal in the screenshot comes from each row's `border-l-2` (the `thread-row--blocking` per-row border), not the section.

**Why this is blocking:** the header is the urgency anchor. The approved design names this as the visual that survives even when the rows below scroll out of view (combined with stickiness — see B2). With it missing, the Blocking band reads identically to the Active band except for label color — that is a 30%+ visual diff against the mockup, well above the 5% threshold (`.claude/rules/visual-parity.md`).

**Fix scope:** add a wrapper element (or apply to the `<h3>`) carrying the tinted background + 3px left border + r1 radius. Apply `text-[var(--danger)]` to both label and count (count already inherits via the parent class, OK).

---

### B2 — [BLOCKING] Blocking section header is not sticky on scroll

**Spec:** approved.md §5.6 — `position: sticky; top: 0; z-index: 2; background: var(--surface-1)`. Mockup applies the sticky to `.section--blocking .section__header`. §1 explicitly: "Non-empty Blocking = always visible during scroll." §7 mobile: "Sticky Blocking header on mobile is critical."

**Code:** zero `sticky` / `top-0` / `z-` declarations in `ThreadSections.tsx`. Grep confirms.

**Why this is blocking:** the founder-contract sentence #1 in the approved design is "Is anything blocking right now?" — answered by the sticky header on long Active scrolls. Without it, the urgency signal scrolls away the moment the user scans the next-up Active list. The list slot in the Submenu is `overflow-y: auto` (Submenu shell), so this is a real, observable regression on any list with > ~6 items.

**Fix scope:** when `section.id === 'blocking'`, apply `sticky top-0 z-[2] bg-[var(--surface-1)]` to the header. Pair with B1's tinted background.

---

### B3 — [BLOCKING] Host pill (hostTag) renders as the wrong size, font, and radius

**Spec:** approved.md §4 — "Visual: same as existing `Tag` component (`var(--surface-ghost)` background, `var(--text-mid)` text, **mono 10px**)." Mockup CSS for `.host-tag`:
```css
font-family: var(--mono); font-size: 10px;
padding: 1px 6px; border-radius: var(--r-pill);
background: var(--surface-ghost); color: var(--text-mid);
letter-spacing: 0.03em;
```

**Code (`ThreadRow.tsx:106` → `Tag.tsx:30`):** `ThreadRow` passes `hostTag` to `<Tag label={hostTag} />` with no `kind`. `Tag` in the no-kind branch renders:
- `font-family: var(--ui)` (sans, **not mono**)
- `text-[12px]` (**not 10px**)
- `px-[8px] py-[2px]` (**not 1px 6px**)
- `rounded-[var(--r2)]` = 8px (**not pill**)

**Why this is blocking:** §4 is explicit about the visual. The pill is a closed-enum tag (`bet | task | knowledge | coach | factory | artifact | agent | user | team`) — a mono, small, pill-radius chip is the recognised pattern in the rest of the system (`AESTHETICS.md` AQ-007 — uppercase/code labels carry mono + tracking). The current rendering reads as a regular content chip, not a host marker. Visible in `/tmp/L8-populated-zoom.png` next to "Chief of Staff — weekly".

**Fix scope:** either (a) introduce a small "host pill" variant (would need component-budget justification; recommend not), or (b) inline a small `<span>` directly inside `ThreadRow` matching the mockup's `.host-tag` class — `font-mono text-[10px] px-[6px] py-[1px] rounded-[var(--r-pill)] bg-[var(--surface-ghost)] text-[var(--text-mid)] tracking-[0.03em]`. Reuse the `Tag` component only if you also ship a 10px mono variant; otherwise the current call site is wrong against the spec.

---

### M1 — [MAJOR] Active sort is `id.localeCompare`, not the spec's `lastActiveAt desc`

**Spec:** approved.md §2 — "Active — `pinned` desc → `hasUnresolvedReview` desc → `lastActiveAt` desc."

**Code (`ThreadSections.tsx:70-75`):** `sortActive` uses `pinned → hasUnresolvedReview → id.localeCompare`. The lore comment acknowledges it: "ThreadItem doesn't yet carry `lastActiveAt`; deterministic id sort is the placeholder until that field lands." Same for `sortById` (Blocking).

**Why this is major (not blocking):** the visual contract — pinned coach floats top, then unresolved-review cluster — is preserved. But the third tier is non-deterministic vs. recency, so two rows with identical pinned + review state will render in id order instead of newest-first. On the demo seed and the e2e fixtures this is invisible; on real data it inverts the founder's expected scan order.

**Fix scope:** add `lastActiveAt: string` to `ThreadItem`, plumb through `useConversationsThreads`, and replace the id placeholder. Track or close as a follow-up before L9 lands. Acceptable to ship L8 if the follow-up is filed.

---

### M2 — [MAJOR] Selected-state visual: only background + border-left, no `--surface-4` contrast against blocking row

**Spec:** approved.md §4 — "Visual: `background: var(--surface-4)` + `border-left: 2px solid var(--primary)`. Selected border wins over blocking border."

**Code (`ThreadRow.tsx:55-67`):** correctly stacks: `selected ? primary border-l : blocking ? danger border-l : ''`, and applies `bg-[var(--surface-4)]` only when selected. Logic is right, but the test fixture in the populated story does not include a selected row so I can't visually verify selected-on-blocking rendering. The hover state also uses `--surface-4` (`hover:bg-[var(--surface-4)]`), so a selected row + hover-leaving sibling = identical chrome with no other distinguishing affordance until you re-hover. The mockup uses `--surface-4` for both hover and selected, so the spec is preserved — but consider the spec is internally weak here.

**Why this is major:** the spec's choice (same surface for hover and selected) means a selected row that the user mouses across loses contrast — though `aria-current="true"` and the primary left-border still convey selection. Not a blocker for L8 (the spec sanctioned it), but I'd flag a future visual tweak: selected = `--surface-4` plus 1px `--primary` outline, hover = `--surface-3`. Out-of-scope for this review beyond noting the spec inheritance.

**Fix scope:** none on this branch. Add a `Selected` story variant to `ThreadSections.stories.tsx` so future agents can eyeball it.

---

### Mn1 — [MINOR] No Up/Down arrow keyboard navigation between rows

**Spec:** approved.md §4 + §8 — "Up/Down arrow → moves focus within the Submenu list (a11y standard; allowed by founder filter)."

**Code:** `ThreadRow` has `tabIndex={0}` (via `clickableProps`) and `Enter`/`Space` handlers. No `ArrowUp`/`ArrowDown` handler at the list or row level. Tab works.

**Why minor:** Tab traversal works; arrow-key list-roving is the convention for vertical lists but the founder filter says only Up/Down (no verb shortcuts), and the spec calls it out as "a11y standard." Ship-blocker only if accessibility is contract-grade for this sprint.

**Fix scope:** add a `roving-tabindex` or simple keydown handler at the `<ul>` boundary in `ThreadSections` that moves focus to the next/prev `[role=button]`.

---

### Mn2 — [MINOR] No `Selected` / `Blocking-on-Sticky` story coverage in `ThreadSections.stories.tsx`

**Spec:** `.claude/rules/design-system.md` — "Every custom component must have a `.stories.tsx` file. Stories are a required deliverable, not optional documentation."

**Code:** stories cover `Populated`, `Empty`, `ActiveQuiet`, `ErrorStateStory`. Missing:
- `Selected` (a row with `selectedId` set, including the blocking-+-selected stacking case from §4).
- `BlockingSticky` (long list to verify B2 once fixed).

**Fix scope:** add two more story exports.

---

## Lint pass on the L8-changed files

`bun run lint:eslint` produced 29 warnings repo-wide. **Zero on the L8-changed files** (`packages/web/src/components/ThreadSections.tsx`, `packages/web/src/layouts/AppShell.tsx`, `packages/design-system/src/ThreadRow.tsx`, `packages/web/src/hooks/useConversationsThreads.ts`). No `design/no-off-grid-spacing`, no `design/no-ai-aesthetic`, no `design/no-off-scale-radius`, no `design/no-hardcoded-color`. Not an issue.

---

## Spec-checklist (for the architect to close the loop)

| Spec | Status |
|---|---|
| Section names: Blocking / Active / Resolved · 24h | ✓ |
| Section render order Blocking → Active → Resolved | ✓ |
| Blocking empty silently absent | ✓ |
| Resolved empty silently absent | ✓ |
| Active empty shows `Quiet — nothing in flight.` | ✓ |
| Empty-list copy `No threads yet` / `Conversations with agents will appear here once started.` | ✓ |
| Error-state title `Couldn't load threads` + Retry | ✓ |
| Counts derived (`section.items.length`) | ✓ |
| Pinned coach floats top of Active | ✓ (sort order correct) |
| Pin glyph SVG before title, `aria-label="Pinned"` | ✓ |
| Resolved opacity 0.7 | ✓ (per-row `opacity-70` class) |
| `aria-current="true"` on selected | ✓ |
| Selected border wins over blocking border | ✓ (logic correct; not story-covered — Mn2) |
| Blocking section danger-tinted background | ✗ (B1) |
| Blocking section 3px left-edge danger accent | ✗ (B1) |
| Blocking section header sticky on scroll | ✗ (B2) |
| Host pill mono 10px pill-radius | ✗ (B3) |
| Active sort by `lastActiveAt desc` | ⚠ (M1 — id placeholder) |
| Up/Down arrow row navigation | ✗ (Mn1) |
| Stories cover key states | ⚠ (Mn2 — missing Selected, Sticky) |
| Density tokens consumed | ✓ |
| No purple/indigo / `rounded-2xl` / oversized padding / hardcoded color | ✓ (lint clean) |

---

## Recommendation

**Do not merge as-is.** B1 + B2 + B3 are all fixable in a single small follow-up patch (≤ 30 LOC across `ThreadSections.tsx` and `ThreadRow.tsx`) and once shipped will close the visual-parity bar.

After fixes: re-run this review with screenshots of (a) populated story including a 10+ row Active section to verify sticky, (b) a Selected story including the blocking-+-selected stack.
