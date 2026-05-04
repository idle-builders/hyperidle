# L15 — Design Review

**Reviewer.** Claude Design (read-only review per `/design-review` skill)
**Scope.** TaskActionsMenu (Tier-2, new) + TaskCard `pending`/`menu-open` variants + Kanban drag removal + WorkTeam wiring.
**Spec inputs.** `docs/design-explorations/L15/approved.md`, `docs/design-explorations/L15/synthesis.md`, `docs/work-packages/TRACK-L.md` § L15 (lines 511–540), `docs/work-packages/L15-step9-applied.md`.
**Sources reviewed.**

- `packages/design-system/html/TaskActionsMenu.html`
- `packages/design-system/html/TaskCard.html`
- `packages/design-system/src/TaskActionsMenu.tsx`
- `packages/design-system/src/TaskActionsMenu.stories.tsx`
- `packages/design-system/src/TaskCard.tsx`
- `packages/design-system/src/TaskCard.stories.tsx`
- `packages/design-system/src/StatusChip.tsx`
- `packages/web/src/shell/Kanban.tsx`
- `packages/web/src/pages/WorkTeam.tsx`
- `packages/shared/src/task-request-verbs.ts`

**Visual verification mode.** Source-and-spec comparison only. The dev server (`bun dev`) and the design-system static server (`bun run ds:serve`) were NOT permitted to run under this review's read-only constraint. Pixel-level Playwright comparison was therefore not performed; the protected `TaskActionsMenu.visual.test.tsx` and `TaskCard.visual.test.tsx` regressions in `packages/design-system/src/__tests__/` are the load-bearing pixel-parity gates and they require `bun run ds:serve` + Playwright to execute. **This review certifies structure, classes, tokens, behaviour, and copy. It does NOT certify pixel parity.**

---

## TL;DR

- **Visual parity verdict.** PROVISIONAL PASS at the structural level. Markup, classes, tokens, and density values in `TaskActionsMenu.tsx` are an exact transcription of `TaskActionsMenu.html` (sub-component shapes, two-line item grid, kbd shortcut atom, divider, section labels, danger color). The TaskCard `pending` and `menu-open` HTML variants render the menu in-flow and replace the cost slot with the pending chip — but **the TSX `TaskCard` does NOT yet render either** (no menu-open outline state, no pending chip rendering). See CRITICAL-1.
- **Accessibility verdict.** PARTIAL. `aria-haspopup`, `aria-expanded`, `aria-controls`, `role="menu"`, `role="menuitem"`, `aria-label="Task actions"` are all correct. Focus returns to the trigger on close. **Missing:** Esc handler, outside-click handler, arrow-key navigation, letter-key shortcuts (S/H/U/D/C/B/R/O/Z), Enter on focused card to open. Touch targets on the trigger (22 × 22 px) violate AQ-015 at viewport ≤ 1024 px. See CRITICAL-2 and WARNING-1.
- **Top issues.**
  1. The card-body-as-trigger pull-in (P-B.1) is **not implemented**. `TaskCard` exposes an `actions` prop but no `onClick` wiring to the menu, and the absolute `···` trigger lives inside the menu component, not on the card. The card body is not pressable for menu-open today.
  2. Cmd/Alt-click → "Request X with reason" Composer modal (P-C.4) is **not implemented**. `MenuItem.onClick` ignores the click event; no modifier branch exists; no Composer modal is mounted.
  3. The pending chip (`↪ PENDING`) and the `menu-open` card outline state are present in the HTML reference but not in `TaskCard.tsx`. The pending state ships in `KanbanTask.pendingRequest` and `task.hasPendingRequest` reaches the menu's `cancel_request` row — but the user never sees the chip, and the menu can't actually open over a card that has "menu-open" styling.

---

## Required reading checked

| Source | Read | Notes |
|---|---|---|
| `packages/design-system/DESIGN.md` | yes | Tokens (surfaces, text, borders, radii, motion) — verified against TaskActionsMenu values. |
| `packages/design-system/PRINCIPLES.md` | yes | Density, restraint, hierarchy-through-weight — verified against menu-item layout. |
| `docs/UI_DESIGN.md` | n/a | File does not exist in this worktree; the canonical document is `docs/concept/UI_DESIGN.md` (read instead). |
| `docs/HUMAN_INTERFACE_LAYER.md` | n/a | File does not exist in this worktree. Behaviour for L15 is fully captured in `approved.md` § 5–6. |
| `docs/INFORMATION_ARCHITECTURE.md` | n/a | File does not exist in this worktree. |
| `docs/work-packages/TRACK-L.md` § L15 | yes | Acceptance criteria + the founder direction "humans request, agents decide". |
| `docs/design-explorations/L15/approved.md` | yes | The pixel + behaviour contract this review scores against. |
| `docs/design-explorations/L15/synthesis.md` | yes | Pull-in rationales (P-B.1, P-B.2, P-C.1, P-C.2, P-C.3, P-C.4). |
| `docs/work-packages/L15-step9-applied.md` | yes | Confirms which prior review findings were applied vs. deferred. |

---

## Findings

### CRITICAL

#### CRITICAL-1 — `TaskCard.tsx` does not render the L15 variants the HTML reference defines

**Spec.** `approved.md` § 3.3 (menu-open outline + raised surface), § 3.4 (pending chip replaces cost slot), § 9 step 3 (TaskCard adds the `···` trigger absolutely, adds the pending slot, surfaces a card-body click callback).
**Reference.** `packages/design-system/html/TaskCard.html` lines 32–41 (`.task-card--menu-open`), 73–110 (`.task-card__actions-trigger` lifecycle), 112–135 (`.task-card__pending-chip`), 537–589 (the React render that wires all three).
**Implementation.** `packages/design-system/src/TaskCard.tsx`:

```tsx
return (
  <div {...dsProps("TaskCard", "2")}
       {...clickableProps(onClick, `bg-[var(--surface-4)] rounded-[var(--r2)] ...`)}>
    <span className="text-[length:var(--density-text)] ...">{title}</span>
    <div className="flex items-center gap-[var(--density-gap)]">
      {betTag && <Tag label={betTag} />}
      <StatusChip status={taskStateToStatus(state)} />
    </div>
    <span className="text-[12px] text-[var(--text-hi)]">{owner}</span>
    {cost && <KeyValue label="Cost" value={cost} />}
    {actions}
  </div>
);
```

What's missing relative to the HTML reference:

1. **No `menu-open` state.** The HTML adds `task-card--menu-open` (outline `--border-emphasis`, background `--surface-5`). The TSX never receives or renders that class. The card therefore reads identically when the menu is open vs. closed — the "menu open implies pressed" contract from approved.md § 3.3 is invisible.
2. **No pending chip slot.** The HTML replaces the cost slot with the dashed-border `↪ PENDING` chip when `pendingRequest` is truthy. The TSX renders `cost` unconditionally and has no `pendingRequest` prop. `KanbanTask.pendingRequest: PendingRequestSummary | null` in `Kanban.tsx` is therefore unread on the visible card; the menu reads `hasPendingRequest` from a sibling derivation and the user's only signal that something is in flight is **the menu's cancel row** — which they only see if they open the menu.
3. **Trigger position is wrong.** The HTML places the `···` trigger absolutely at top-right of the card itself (relative to `.task-card`). The TSX TaskActionsMenu places its own trigger absolutely at top-right of the **menu wrapper** (`<div className="relative inline-block">`). When `actions` is rendered as the last child of the card flex column, the trigger ends up in the bottom-right region rather than at the top-right corner. This breaks the "top-right corner" affordance that approved.md § 2.2 specifies and that every story image in `approved.md` shows.
4. **Card body is not the menu trigger (P-B.1).** Approved.md pull-in 1 (and synthesis.md § P-B.1) says clicking anywhere on the card body opens the menu. The TaskCard's `onClick` prop is unused by `WorkTeam.tsx` (`renderTaskActions` only renders the menu, it does not wire the card-body click). The asymmetry between mouse and touch that the synthesis explicitly resolved is back.

**Severity reasoning.** The story's visual contract has three card-states the user must perceive: at-rest, menu-open, pending. Today the user perceives one. The implementation passes the unit-level "the menu opens" test but fails the spec's user-perceptible state model.

**Suggested fix shape (no code).** Promote the trigger and the pending chip into `TaskCard` itself behind a single L15-shaped prop set: `onOpenActions?: () => void`, `actionsOpen?: boolean`, `pendingRequest?: PendingRequestSummary | null`. The `actions` prop then renders only the floating menu surface, anchored to the trigger inside the card. The page passes `pendingRequest={task.pendingRequest ?? null}` and an open/close state slot.

---

#### CRITICAL-2 — Keyboard / dismiss / shortcut behaviour from approved.md § 5.2 is largely missing

**Spec.** `approved.md` § 5.2 — Tab moves focus across cards; `Enter`/`Space` on focused card opens the menu; `↑`/`↓` moves highlighted item; letter keys (`S` `H` `D` `B` `O` `R` `Z`) activate matching items; `Enter` fires verb; `Cmd+Enter` opens Composer; `Esc` closes (returns focus to card).
**Implementation.** `packages/design-system/src/TaskActionsMenu.tsx`:

What ships:

- `aria-haspopup="menu"`, `aria-expanded={open}`, `aria-controls={menuId}`, `role="menu"`, `role="menuitem"`, `aria-label="Task actions"`. **Correct.**
- `triggerRef.current?.focus()` on close. **Correct.**

What's missing:

- **No `Esc` handler.** The menu cannot be dismissed from the keyboard without tabbing back to the trigger and re-pressing it (which toggles, not closes-by-Esc).
- **No outside-click handler.** Clicking outside the menu does NOT close it. Approved.md § 5.1 row "Click outside menu" → "Menu closes" is unmet.
- **No `↑` / `↓` arrow-key navigation.** Items are focusable in DOM order via Tab only; the menu's own keyboard model is browser default, not the spec's.
- **No letter-key shortcuts.** The shortcut chips render (`S`, `H`, `D`, `B`, `O`, `R`, `Z`, `⌘L`) — they teach the user, but nothing in the component listens for them. This is a contract-vs-affordance violation: the UI advertises shortcuts that don't work.
- **No `Enter`/`Space` on focused card to open the menu.** The card is not a `role="button"` with the menu as its action; the trigger is the only opener.
- **No focus trap inside the menu.** Tabbing from the last menu item escapes to the next focusable element on the page, not back to the first item — DaisyUI menu primitives don't trap by default and the wrapper doesn't either.

**Severity reasoning.** The shortcut chips visible in the menu (`S`, `H`, `D`, `B`, `R`, `O`, `Z`, `⌘L`) become decorative noise — a power-user lie. Esc and outside-click are baseline menu behaviour any user expects. This is the difference between a menu and a popover that happens to look like a menu.

**Suggested fix shape (no code).** Add a single keyboard controller hook that owns: open-state, last-trigger-ref, Esc-to-close, outside-click-to-close (mousedown listener with ref check), Tab cycling within `[role="menuitem"]` children, arrow-key roving tabindex, and a registered letter-shortcut map (the same map that paints the `Shortcut` kbd glyphs).

---

#### CRITICAL-3 — Cmd/Alt-click "Request X with reason" Composer modal (P-C.4) is not implemented

**Spec.** `approved.md` Pull-in 4 + § 5.1 row "Cmd-click (or Alt-click) menu verb item → Opens Composer modal pre-populated with the verb"; § 5.2 row "Cmd+Enter on menu item → Open Composer modal for that verb"; toast distinction in § 4 row "Sent (with reason)".
**Implementation.** `TaskActionsMenu.tsx` `MenuItem` accepts `onClick: () => void` (no `MouseEvent` parameter). `WorkTeam.tsx`'s `onRequestStateChange` is invoked without modifier inspection; `reason` is wired through the API plumbing but no UI ever asks for one. No Composer modal is mounted in `WorkTeam.tsx`.

**Severity reasoning.** The "default = fast; modifier = with-reason" grammar is one of the four named pulls in approved.md. The contract is half-built: the server accepts a `reason` body, the function signature carries an `optional reason` parameter, but the UX path that lets a human supply it does not exist. Reasoned requests are unreachable.

**Suggested fix shape (no code).** Change `MenuItem.onClick` to `(event: ReactMouseEvent | ReactKeyboardEvent) => void`. Branch in the verb-row handler on `event.metaKey || event.altKey || (event.key === "Enter" && event.metaKey)`: if true, open a DaisyUI `modal` with the existing `Composer` (Tier 2) seeded by the verb's primary text, `Why? (optional — the agent reads this before deciding)` placeholder, and `Cmd+Enter` submit; on submit, fire `onRequestStateChange(verb, reason)`. Same modal is reused by "Reply in thread…" with placeholder `Reply in thread…`.

---

### WARNINGS

#### WARNING-1 — `···` trigger is 22 × 22 px (AQ-015 minimum is 44 px at viewport ≤ 1024 px)

**Spec / lint.** `.claude/rules/aesthetic-quality.md` AQ-015 — touch targets ≥ 44 CSS px on every interactive element at viewport ≤ 1024 px.
**Reference.** Approved.md § 6 says "the `···` button becomes always-visible (no hover state on touch)" and "Menu items get `min-height: 44px` (AQ-015)" but is silent on the trigger touch-target. The HTML mockup uses 22 px (`packages/design-system/html/TaskCard.html` line 81–82).
**Implementation.** `TaskActionsMenu.tsx` line 150: `w-[22px] h-[22px]` on the trigger.

**Reasoning.** 22 px is a desktop-pointer-precise affordance. Approved.md § 6 promises "always-visible on touch" but a 22 px tap target is below the AQ-015 floor — and the card body is NOT a fallback opener (see CRITICAL-1 #4). On mobile the menu is unreachable for a fat-finger user.

**Suggested fix shape.** Either (a) at viewport ≤ 1024 px, expand the trigger's hit area via `padding` (keep visual `···` at 22 px but make the hit-rect 44 × 44 px), or (b) wire the card body as the opener per CRITICAL-1 #4 — both fixes resolve this.

#### WARNING-2 — `TaskActionsMenu` is now a 7th Tier-2 component but the budget manifest was not updated

**Spec.** `docs/concept/UI_DESIGN.md` lines 53–66, 121–122, 134 — Tier 2 list is exactly six (`ThreadRow · BetCard · PitchCard · TaskCard · KnowledgeRow · NotificationRow`) and "Adding a 20th needs a written reason in this file."
**Implementation.** `TaskActionsMenu.tsx` carries `data-tier="2"`; `TaskActionsMenu.stories.tsx` does NOT carry the conventional `tier: "2" as const` story-meta (every other Tier-2 story does — grep shows 11 examples). The component is exported from `packages/design-system/src/index.ts` lines 81–82 but the manifest in `docs/concept/UI_DESIGN.md` still says six.

**Reasoning.** Approved.md § 9.1 explicitly chose Option β with the disclaimer "+1 Tier-2 component (out of the 6 currently in the budget — but L15's brief invites the budget conversation)." The budget conversation needs to be reflected in the canonical manifest. The web app now ships seven Tier-2 components and a viewer story that doesn't self-declare its tier.

**Suggested fix shape.** Update `docs/concept/UI_DESIGN.md` § "Tier 2 — Blocks" to seven entries with `TaskActionsMenu` and the rationale ("L15 — encapsulates state-conditional verb mapping reused by Kanban + future thread surfaces"). Update the "5 + 6 + 8 = 19" line to "5 + 7 + 8 = 20". Add `tier: "2" as const` + `uses` to `TaskActionsMenu.stories.tsx` to match the storybook convention.

#### WARNING-3 — Stories file is shallow; missing critical states from the spec

**Reference.** `approved.md` § 4 enumerates eleven states: Default, Hover, Focus, Open, Loading menu item, Sent (atomic), Sent (with reason), Reply sent, Error, Pending visible, Cancel pending.
**Implementation.** `TaskActionsMenu.stories.tsx` ships six story exports — `InProgress`, `Blocked`, `Review`, `Accepted`, `Pending`, `Proposed`. All six show one state: "menu open with verbs for state X". The story file does not include:

- the **trigger** in any of its visual states (at-rest opacity 0, hover opacity 0.6, focus opacity 0.6, menu-open opacity 1) — there is no Trigger story
- the **loading** state for an in-flight verb
- the **error** state with the RETRY toast / alert variant
- the **toast confirmations** (Sent / Cancelled / Reply posted / Failed)
- the **Composer modal** open with the reason field
- the **mobile bottom-sheet** rendering (or any density-toggle variant)
- a story rendering the menu inside an actual `TaskCard` (the integration shape, which is what the user sees)

**Reasoning.** The story file is the design-system viewer's contract for what the component is. Six "menu shape varies by state" cards do not cover the eleven-state contract. The "shallow stories" smell is also a `/design-critique` deduction.

**Suggested fix shape.** Add stories: `TriggerStates` (4 mini-cards showing at-rest / hover / focus / menu-open), `Loading`, `WithReasonComposer`, `Toasts`, `MobileBottomSheet`, `InsideTaskCard` (the integration). Every story exports a `tier: "2"` meta.

#### WARNING-4 — `Reply in thread…` and `Snooze 24h` and `Copy task link` are wired to no-ops on the page

**Reference.** Approved.md § 3.5 items 6–11; § 4 row "Reply sent → Modal closes; toast `Reply posted.`"; step9-applied.md W-2 confirms these are intentionally no-op for now.
**Implementation.** `WorkTeam.tsx` does not pass `onReplyInThread`, `onOpenThread`, `onSnooze24h`, or `onCopyLink` to `TaskActionsMenu`. The menu still renders these items (they show + click → menu closes via `onClick={() => { onReplyInThread?.(""); close(); }}`). The user sees four perfectly-styled menu items that do nothing.

**Reasoning.** L15-step9-applied W-2 acknowledges this and says the items "still render but their `?.()` guards make the click a no-op." That's a deliberate scoping decision, but from the design viewpoint it ships a menu whose universal section is non-functional. At minimum the items should be visually disabled (`aria-disabled`, dimmer text) until L18 wires them, OR they should be hidden via a passthrough like `Kanban.renderTaskActions` deciding which rows to mount. The current shape advertises and pretends.

**Suggested fix shape.** Either disable the four rows (greyed `--text-lo`, `aria-disabled="true"`, no hover bg) when their callbacks aren't supplied, OR omit the rows entirely when their callback is `undefined`. The teaching value of the "→ secondary" hint is preserved either way; the lie is removed.

#### WARNING-5 — Visual-parity tests cannot certify HTML ↔ TSX equivalence in their current shape

**Reference.** `.claude/rules/visual-parity.md` — TSX must match HTML pixel-for-pixel; threshold 5%.
**Implementation.** `packages/design-system/src/__tests__/TaskActionsMenu.visual.test.tsx` and `TaskCard.visual.test.tsx` exist and are pinned protected. They navigate to `${BASE}/TaskActionsMenu.html` and `${BASE}/#TaskActionsMenu` (Playwright) and compare via pixelmatch. They require:

1. `bun run ds:serve` on port 8098.
2. Playwright installed in the design-system package.
3. The TSX viewer to expose a route that mounts the bare component (the test reads `${BASE}/#TaskActionsMenu`).

The viewer's wrapper container, the design-system body padding, and the absence of a Demo grid in the TSX render path all matter. **None of this was exercised under this read-only review.** The TaskCard visual test additionally needs to cover the new `pending` and `menu-open` variants — `data-variant="pending"` / `data-variant="menu-open"` selectors are present in `TaskCard.html` but I have not confirmed the test enumerates them.

**Reasoning.** Pixel parity is the visual-parity rule's load-bearing assertion. Until the protected visual tests run green in CI on this branch, the "≤ 5% diff" claim is unverified.

**Suggested fix shape.** Run `bun run ds:serve & bun run test --filter=design-system` once outside this review. Confirm the diff PNGs land under `packages/design-system/tests/visual/__diffs__/TaskActionsMenu/{state}/diff.png` and `TaskCard/{pending,menu-open}/diff.png`. Add a TaskCard story for the menu-open + pending variants if missing.

---

### OBSERVATIONS (no action required, design notes)

#### O-1 — Verb language is correctly non-imperative

`packages/shared/src/task-request-verbs.ts` `REQUEST_VERB_TEXT` and the secondary lines in `VERB_DEFS` (TaskActionsMenu.tsx) match approved.md § 8 verbatim. Every state-change row begins with `Request ` or `Hand back to me`. Every secondary line ends with `agent decides` or `agent confirms` (except `cancel_request` which ends `withdraws the request` — the cancel is a user action, not an agent decision, so this is correct). **No imperative-mood verb leaked in.** The toast copy (when toasts are wired) is also pre-staged in approved.md § 8 for L18 — ship-blocking only if toasts are added inline.

#### O-2 — Drag is verifiably absent from `Kanban.tsx`; preserved on Canvas

`grep useDraggable|useDroppable|DndContext|DragOverlay packages/web/src/shell/Kanban.tsx` returns zero matches. The same grep on `packages/web/src/shell/Canvas.tsx` returns nine matches (lines 7–14, 84, 147, 184, 195, 208) — `Canvas` keeps its `DndContext`, `useDraggable` on `BetCard`, and `useDroppable` on the columns. **R-10 honoured. R-11 (no `not-allowed` cursor or shake) honoured by simple absence — no failure-to-drag CSS or handler appears anywhere.** Approved.md § 7 verification points all check out at the source level.

#### O-3 — Section headers correctly use mono uppercase, not regular case

The HTML reference labels say `Request state change` / `Thread` / `Other` rendered with `text-transform: uppercase` + `font-mono`. Approved.md § 3.5 calls them "section label `mono-sm`: `REQUEST STATE CHANGE`" — uppercase in the spec is the rendered output, not the source string. The TSX correctly applies `font-heading uppercase tracking-[0.05em]`. The visual reads as `REQUEST STATE CHANGE` even though the source string is `Request state change`. **No issue — reading the source feels off-spec, but the rendered output is on-spec.** Worth a `@lore` comment in the future.

#### O-4 — `tracking-[0.05em]` on uppercase section labels exceeds the AQ-007 default

`AQ-007` says uppercase StatusChip / Tag labels get `+0.02em` tracking; the menu's uppercase section label uses `0.05em`. `DESIGN.md` `--tracking-caps` is `0.02em` (default) / `0.015em` (comfortable). The menu hard-codes `0.05em` — **same as the HTML reference** and same as `StatusChip.tsx` (`tracking-[0.05em]`). The 0.05em precedent is established for chip-class uppercase glyphs. Acceptable inheritance, but the K7 designer-call to keep StatusChip at 0.05em was specific to that one component's chip context — the menu's 11 px uppercase label is the same context. Carry forward.

#### O-5 — `MenuItem` `MouseEventHandler` could accept the event for free

When CRITICAL-3 is fixed, the `MenuItem` `onClick` should be typed `(e: MouseEvent | KeyboardEvent) => void`. The current `() => void` shape has zero callers but blocks the modifier-key branch at the type level. Cheap to upgrade; mention it in the L18/L21 follow-up.

#### O-6 — `Composer` (Tier 2) exists and is unused for L15

`packages/design-system/src/Composer.tsx` exists. Approved.md § 2.2 row "Composer modal" promises it's reused for "Reply in thread…" and "Request X with reason." Wiring it would close CRITICAL-3 and the universal-section no-op rows of WARNING-4 in one go.

#### O-7 — The `request-pending` StatusChip variant from approved.md § 9 step 4 was NOT added to StatusChip

Approved.md § 9 step 4 says "`StatusChip` adds a `request-pending` variant rendering `↪ PENDING` with `--surface-ghost` background and dashed `--border-default` border." The TSX `StatusChip` (`packages/design-system/src/StatusChip.tsx`) still ships six statuses (`healthy / behind / blocked / paused / done / error`) — no `request-pending`. The HTML reference handles it as a separate `.task-card__pending-chip` class on TaskCard, not a StatusChip variant. **The two solutions are interchangeable, but neither has shipped to TaskCard.tsx itself (CRITICAL-1 #2).** Pick one when fixing CRITICAL-1.

#### O-8 — DaisyUI `dropdown` / `menu` primitives are not actually used

Approved.md § 2.2 says "DaisyUI `dropdown` + `menu`". The TSX uses raw divs + buttons + Tailwind utilities, not `dropdown`/`menu` classes. This is fine — the design-system rule is "use DaisyUI directly, never wrap" — but the menu is a fully custom popover, which means it inherits zero DaisyUI behaviour (close-on-outside, etc.). That's part of why CRITICAL-2 exists. If the project's other Tier-2 popovers (BlockActionsPopover) solve the same dismissal problem with the same hand-rolled approach, the missing behaviour is a cross-cutting smell worth its own simplification pass.

---

## States checklist (against `approved.md` § 4)

| State | In TSX? | Notes |
|---|---|---|
| Default (card identical, `···` invisible) | NO | Trigger lives inside menu wrapper, not on the card; opacity-0 only applies via the menu's wrapper not the card's hover. CRITICAL-1 #3. |
| Hover (`···` opacity 0.6 over 80ms) | PARTIAL | The CSS exists in `TaskCard.html` (`.task-card:hover .task-card__actions-trigger { opacity: 0.6 }`) but the TSX trigger is not a child of TaskCard, so the parent-hover selector doesn't fire. |
| Focus (card outline `--primary`) | NO | TaskCard already has `focus-visible:outline` via `clickableProps`, but `outline: 1px solid var(--primary)` is the spec; current is `focus-visible:ring-1 focus-visible:ring-primary`. Visually similar; semantically OK. |
| Open (menu opens; card outline `--border-emphasis`; `···` opacity 1) | PARTIAL | Menu opens; trigger reaches opacity 1; **card outline never changes** (CRITICAL-1 #1). |
| Loading menu item | NO | No spinner in `MenuItem`; no busy state. Approved.md § 4 row 5 unmet. |
| Sent (atomic) — toast | NO | No toast surface in `WorkTeam.tsx`; click → POST → silence. |
| Sent (with reason) — Composer modal | NO | CRITICAL-3. |
| Reply sent — Composer modal | NO | WARNING-4. |
| Error — `alert-error` toast with RETRY | NO | No error surface; `postRequest` throws on failure but is never caught. |
| Pending visible — chip in cost slot | NO | CRITICAL-1 #2. |
| Cancel pending — toast | NO | No toast; cancel button works structurally (POST with `cancel_request`) but no user-perceived confirmation. |
| Drag attempted — no feedback | YES | Drag is fully gone from Kanban. R-5 + R-11 honoured. |

**12 states defined; 1 fully shipped, 4 partially shipped, 7 not shipped.** This is the dominant gap.

---

## Behavior checklist (against `approved.md` § 5)

| Action | Expected | Implemented? |
|---|---|---|
| Hover card | `···` fades in | NO — see Default/Hover above. |
| Click card body | Menu opens | NO — P-B.1 not implemented. |
| Click `···` | Menu opens | YES |
| Click outside menu | Menu closes | NO — CRITICAL-2. |
| Click menu item | Verb fires, menu closes, toast appears | PARTIAL — POST fires, menu closes, no toast. |
| Cmd-click menu verb item | Composer modal opens | NO — CRITICAL-3. |
| Click pending chip | Opens thread | NO — pending chip not rendered. |
| Tab | Move focus across cards | YES (DOM order via `clickableProps`) |
| Enter / Space on focused card | Open menu | NO — opens via `clickableProps.onClick` only if a card-body click handler is wired (not wired). |
| ↑ / ↓ in menu | Move highlight | NO — CRITICAL-2. |
| Letter key | Activate matching item | NO — CRITICAL-2. |
| Enter on menu item | Fire verb (atomic) | YES (browser default `<button>` Enter) |
| Cmd+Enter on menu item | Open Composer modal | NO — CRITICAL-3. |
| Esc | Close menu | NO — CRITICAL-2. |
| Tap card (mobile) | Bottom-sheet menu | NO — desktop popover only; AQ-016 mobile flip not handled. |
| Long-press | No action | YES (no handler exists) |

---

## Component-budget audit

- `TaskActionsMenu` ships as Tier 2 (`data-tier="2"`). Approved.md § 9.1 chose Option β. → **Fine in principle, but `docs/concept/UI_DESIGN.md` was not updated to reflect the new count.** WARNING-2.
- No new Tier 1 primitives. No new Tier 3 regions. R-12 honoured.
- No `useDraggable`/`useDroppable`/`DndContext`/`DragOverlay` in `Kanban.tsx`. R-10 + R-11 honoured.
- Story file present (`TaskActionsMenu.stories.tsx`) — required deliverable. Six exports cover six state-vector slices; eleven-state contract is undercovered. WARNING-3.

---

## Design-system rule check (`.claude/rules/visual-parity.md`)

- HTML files in `packages/design-system/html/` were not modified by this review.
- I have not been able to run `bun run ds:sync` to confirm pixel diff. WARNING-5.
- TSX classes are a faithful structural translation of the HTML CSS — same tokens, same numeric values (4 px padding, 1 px gaps, 22 × 22 px trigger, 30 px top-offset for menu, 260–280 px width, 13 px primary, 11 px secondary, 11 px shortcut chip, 10 px kbd glyph, `var(--surface-1)` menu surface, `var(--surface-3)` kbd surface, `var(--surface-ghost)` item hover, `var(--primary-dim)` highlighted item, `var(--danger)` cancel item).
- Pixel-level certification: **deferred** until visual tests run.

---

## Verb / copy register check (against `approved.md` § 8)

| Surface | Spec copy | Implemented copy | Verdict |
|---|---|---|---|
| Section label | `REQUEST STATE CHANGE` | `Request state change` (uppercased by CSS) | OK |
| Verb (atomic) | `Request stop` · `→ asks the agent to abandon — agent decides` | exact match (TaskActionsMenu.tsx + REQUEST_VERB_TEXT) | OK |
| Verb (handover) | `Hand back to me` · `→ moves ownership to you — agent confirms` | exact match | OK |
| Universal (open thread) | `Open thread` · `→ jump to the conversation` | exact match | OK |
| Universal (reply) | `Reply in thread…` · `→ send a free-form message` | exact match | OK |
| Pending item | `Cancel pending request` · `→ withdraws the request` | exact match | OK |
| Toast (sent) | `Request sent — agent will respond.` | NOT IMPLEMENTED | toast surface missing (CRITICAL-2 / WARNING) |
| Toast (cancelled) | `Request cancelled.` | NOT IMPLEMENTED | same |
| Toast (reply posted) | `Reply posted.` | NOT IMPLEMENTED | same |
| Toast (error) | `Request failed — try again.` (RETRY) | NOT IMPLEMENTED | same |
| Pending chip text | `↪ PENDING` (mono caps) | NOT IMPLEMENTED on TaskCard.tsx | CRITICAL-1 #2 |
| Pending chip title | `Requested: <verb> · <relative time>` | NOT IMPLEMENTED on TaskCard.tsx | CRITICAL-1 #2 |
| Composer placeholder (reason) | `Why? (optional — the agent reads this before deciding)` | NOT IMPLEMENTED | CRITICAL-3 |
| Composer placeholder (reply) | `Reply in thread…` | NOT IMPLEMENTED | WARNING-4 |

**Verdict.** Every copy string that ships matches the spec. Eight strings the spec defines do not ship at all because their UI surface is unimplemented.

---

## Final scoring

- **Visual parity (HTML ↔ TSX) — structural:** PROVISIONAL PASS. All implemented chrome matches the HTML reference at the class/token/value level; no styling change leaked into the HTML files. Pixel certification needs `bun run ds:serve` + the protected visual tests.
- **Visual parity (TaskCard variants) — `pending` and `menu-open`:** FAIL. The HTML reference defines them; `TaskCard.tsx` does not render them. CRITICAL-1.
- **Component spec adherence:** PARTIAL. The base (quiet-menu) ships. **Three of the five named pulls do not ship** — P-B.1 card-body trigger (CRITICAL-1 #4), P-B.2 Composer modal for reply (WARNING-4), P-C.4 Cmd-click "with reason" Composer (CRITICAL-3). P-C.2 (cancel pending) and P-C.3 (per-item secondary text) ship correctly.
- **States:** 1 / 12 fully shipped.
- **Accessibility:** PARTIAL. ARIA scaffolding correct; keyboard model and dismiss model missing (CRITICAL-2). Trigger touch-target below AQ-015 floor (WARNING-1).
- **Verb language:** PASS. Every state-change verb is `Request <verb>` or `Hand back to me`. No imperative-mood verbs leaked in.
- **Drag-removal UX:** PASS. R-5 / R-10 / R-11 all honoured.
- **Canvas drag preservation:** PASS. `Canvas.tsx` untouched.
- **Component budget:** PARTIAL. Option β chosen and shipped; `docs/concept/UI_DESIGN.md` not updated (WARNING-2).
- **Design-system rule (TSX may not modify HTML):** PASS.

**Top-3 issues to fix before this story can be called done:**

1. **CRITICAL-1.** `TaskCard.tsx` must render the `pending` chip (cost-slot replacement) and the `menu-open` outline state, with the `···` trigger anchored to the card's top-right corner — not nested inside the menu wrapper. The card body must be a click-trigger for the menu (P-B.1).
2. **CRITICAL-2.** `TaskActionsMenu` must own a keyboard + dismiss controller: Esc closes, outside-click closes, ↑/↓ rove items, letter shortcuts (S/H/U/D/C/B/R/O/Z) fire matching items, focus traps inside the menu while open. Without these, the visible kbd shortcut chips are decorative.
3. **CRITICAL-3.** Wire the Composer modal for "Request X with reason" (Cmd/Alt-click or Cmd+Enter on a verb item) and for "Reply in thread…". The reason payload already plumbs through `onRequestStateChange(verb, reason?)` and the server `POST /api/tasks/:id/request` body — only the UI surface is missing.

**WARNING-1, WARNING-2, WARNING-3, WARNING-4, WARNING-5** are not story-blocking but should be triaged into L15's wrap-up commit or queued as L15.x follow-ups before L18 lands the same Composer modal in the thread surface.
