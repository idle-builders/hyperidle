# L15 — Approved Design Critique (Phase 5 gate)

**Score: 8.4 / 10** — passes ≥ 7 gate. Ready as input contract for
`/architecture L15`.

## Per-dimension scores

| Dimension | Score | Notes |
|---|---|---|
| 1. Visual Hierarchy | 9 | Card-content-first; menu hierarchy is clear (section label → state-conditional verbs → pending-only verb → divider → universal verbs). Selected card has visible ring + background lift. Pending chip is monochrome but visually distinct from cost. |
| 2. Spacing & Density | 9 | All values via `--density-*` tokens or 4px-grid increments. Card adds zero chrome at rest. Menu padding is 4px / 6px / 10px throughout. `···` button is 22×22 (4px-aligned). |
| 3. Typography | 9 | Body 13px (menu items), labels 11px mono caps, secondary line 11px mono. Two weights (500 for primary verb, 400 for secondary). No new sizes. Tabular nums on cost. |
| 4. Color Usage | 9 | Tokens only. No purple. Selected item `--primary-dim`. Pending chip monochrome (`--surface-ghost` + `--border-default` dashed) — preserves red-only-for-danger discipline. Error toast uses `--danger`. |
| 5. Component Coherence | 8 | Reuses TaskCard, StatusChip, Composer, DaisyUI dropdown/menu/modal/toast/btn. Adds at most 1 Tier-2 (`TaskActionsMenu`) — within budget rules ("must be used in 2+ contexts" — the menu is reusable across the future thread surface). Drag removal is clean — same DndContext pattern that Canvas keeps, just absent here. |
| 6. State Coverage | 9 | 11 states enumerated with copy and component composition (default, hover, focus, open, loading-item, sent-atomic, sent-with-reason, reply-sent, error, pending-visible, cancel-pending, drag-attempted). Mobile + touch states each specified. |
| 7. Accessibility | 8 | aria-haspopup, aria-expanded, role=menu, role=menuitem all set. Letter shortcuts native to DaisyUI menu. Touch targets ≥ 44px on mobile. Card-body click is the unified hot path. One reservation: clicking the entire card body to open a menu may compete with clicking the pending chip to open the thread — the resolution (chip handler stops propagation) needs explicit testing. |
| 8. Anti-slop | 9 | Zero AI-aesthetic tells. No purple, no rounded-2xl, no decorative icons (only `↪` arrow on the pending chip — a real semantic glyph). No hero, no oversized padding. Verb copy avoids superlatives. The card stays a card. |
| 9. Verifiability | 9 | Every state has a test path: drag-attempted = DOM unchanged + state unchanged; verb-fired = thread message exists; pending-chip = derives from request message presence; cancel = chip disappears. The architect's open questions are scoped (not the visual contract). |

## CRITICAL

None.

## WARNING

- **W-1** — The card-body-click trigger overlaps with the pending-chip click
  trigger. Resolution: pending chip handler must `stopPropagation()` so the
  menu doesn't open simultaneously with the thread navigation. **Note in
  approved.md § 5.1.** Already specified there: "Click pending chip → Opens
  thread (does NOT open menu)." Verify in tests.
- **W-2** — Letter shortcut collisions on `S` (Stop / Snooze) when both
  verbs are visible. The architecture step picks a non-conflicting letter
  set or the design degrades gracefully (first-wins). Already in § 10
  open questions.

## SUGGESTION

- **S-1** — The Composer modal pattern for "with-reason" requests is
  reusable. Consider naming it `RequestComposer` (Tier-2-shape, but
  composed of `Composer` + DaisyUI modal). Architect call during § 9.1
  evaluation.
- **S-2** — When the menu is open, hovering over a verb item could
  optionally preview the request as a ghost message in the thread (if
  the thread is visible elsewhere). Out of scope for L15; nice-to-have
  for a future polish pass.

## Verdict

Approved design clears the gate decisively. It composes from existing
primitives, preserves the canvas drag, removes the kanban drag silently,
and embeds the human-requests / agent-decides contract in the verb copy
and per-item secondary lines. The architect's job is to wire the
typed-request message kind, the pending-state derivation, and the
verb-identifier set — none of which re-litigates the visual contract.
