# Design Critique: L15 — Approved (final gate)

**Score: 8.4/10** (H:9 S:8 T:8 C:9 Co:9 St:8 A:8 AS:9 PP:8) — sum 76/90

**Verdict: PASS.** Above the ≥ 7 gate. Design contract locks here for `/architecture L15`.

## Per-dimension scores

| # | Dimension | Score | One-line read |
|---|---|---|---|
| 1 | Visual hierarchy (H) | 9 | The unread chips on `Webhook signature verify` and `JWT refresh logic` (column 2 + column 3) pull the eye across the Kanban — the founder's scan path is unambiguously "where do I look first." Title weight, status-chip weight, and footer weight stack correctly. |
| 2 | Spacing & density (S) | 8 | Card body unchanged from current TaskCard. New footer adds 28px (one row + 4px divider + 4px pad). Footer's 4px vertical pad is sub-grid (chip-internal scale per AESTHETICS.md spacing rule). Popover internal pad on the 4/8/12 ladder. |
| 3 | Typography (T) | 8 | Two families (Geist + Geist Mono). Footer 12px UI weight 500. Mono caps labels (REQUEST FROM, NOTE OPTIONAL, OPEN THREAD) at 11px with `--tracking-caps`. Tabular nums on count + cost. The one-row footer is dense but legible. |
| 4 | Color usage (C) | 9 | Pure semantic tokens. `--primary` reserved for: selected-verb tint (Pause), unread chip background + dot, focus rings. `--danger` reserved for `Kill` text + blocked card border + the `WEBHOOK SIGNATURE VERIFY` blocked StatusChip. Color is never the only signal — unread chips also use the primary-tint background and `--text-hi` count, plus the dot's shape. |
| 5 | Coherence & consistency (Co) | 9 | Net zero new components. The Tag's two-state (`default`/`unread`) is a one-prop API extension. Popover grammar (Cancel + Send + optional note + selected-verb tint) mirrors L1's verdict popover. Same surface ladder, same radius scale, same motion ladder. |
| 6 | States & feedback (St) | 8 | Spec covers empty / loading / error / populated / terminal / orphan / unread / overflow / mobile / popover-near-edge. The mockup embodies populated + terminal (Done) + orphan (Rate limit middleware) + unread (Webhook + JWT) + popover-open. Loading and error are described in spec but not embodied — common pattern, acceptable for this gate. |
| 7 | Accessibility (A) | 8 | `aria-haspopup`, `aria-expanded`, `aria-live`, `aria-label` on every interactive. Focus-return contract specified. Color-plus-shape for the unread signal (dot + tint + bold count). Touch targets ≥ 44 on mobile via padding bump. Mobile inputs ≥ 16px to prevent iOS zoom (AQ-005). The architect must verify `--text-mid` / `--danger` contrast over `--surface-2` (popover) in both Lucid Dark and Lucid Light. |
| 8 | Anti-slop (As) | 9 | No emoji, no purple gradient, no oversized padding, no `rounded-2xl`, no glass, no decorative icons, no centered hero, no marketing copy, no hero section, no shadow-lg outside overlays (popover qualifies — `--float` shadow is the canonical overlay token). The `▾` chevron is a typographic glyph at `--text-lo`. The unread dot is a CSS shape, not a unicode character. The `OPEN THREAD` mono caps label (orphan card) uses the design system's existing label register — visually invariant with the rest of the chrome. |
| 9 | Premium polish (PP) | 8 | Tabular nums on the count + the cost (AQ-006). `--tracking-caps` on uppercase labels (AQ-007). Selected-verb tint (`--primary-dim` 0.08) visibly distinct from hover (`--surface-ghost` 0.05) — Fix 2 delivered. The increment-on-send animation is locked at `--motion-medium` (Fix 1) — visible, not subliminal. Closed motion ladder. `prefers-reduced-motion` honoured via the existing tokens.css block. |

---

## CRITICAL

(none — the design clears the gate cleanly.)

---

## WARNING

- **Loading and error states are spec-only, not embodied.** The mockup doesn't render them. Standard for a design-gate review, but the architect's plan must include vitest cases for both. `Saving…` strip is `aria-live="polite"`; error strip is `role="alert"` per the spec.

- **Architect must verify Lucid Light contrast.** `--danger` text in the popover (Kill) sits on `--surface-2` (#f4f4f2 in light mode) — the spec requires ≥ 4.5:1 (AQ-010). Light mode `--danger` (#a91515) gives ~6.5:1 on #f4f4f2 by my recall — clears, but the architect should run the live check during `/architecture` to lock the calculation. Same check for `--text-mid` over the popover surface.

- **Popover anchor library decision.** Open question 4 in §12 of the spec. Designer's preference is DaisyUI; if rightmost-column edge-clip is a real problem in practice, the architect picks `@floating-ui/react`. Either way the visual contract is the same; this is an implementation choice.

---

## SUGGESTION

- **Consider exposing a per-task `isStale` derived field** to the future task-detail story (L20). The `--primary` left-border treatment is reserved here for the click-flash; future stories may want to show "this task hasn't moved in N days" as a persistent border. Nothing to do in L15; just flagging the visual reservation.

- **The orphan-state `OPEN THREAD` text is 11px mono caps**; consider whether 12px reads better at low contrast. The mono caps register is correct — only the size is debatable. Designer's call: stay at 11px to match the rest of the chip-scale chrome on the card.

- **The unread dot at 6×6px** is the smallest signal in the entire L15 surface. On a 4K display at 100% zoom, this is comfortable. On a 5K display at 90% zoom (some users do this), the dot may sub-pixel. Consider scaling to 7px or adding a 1px subtle outline (`box-shadow: 0 0 0 1px var(--surface-1)`) to give it a halo separation from the chip background. Out of L15 scope but worth flagging for the L18b polish pass.

---

## What's working well

- **The cross-card scan path.** The two unread chips at (Webhook signature verify) and (JWT refresh logic) are visually distinct from the silent threads on (Design signup form, 1) and (Implement login endpoint, 3). The eye locates them in under a second. This is what the variant-B pull-in earned its place for.

- **The popover's selected-verb tint is now visibly distinct from hover.** The `Pause` row's `--primary-dim` (0.08) tint is clearly lighter and bluer than the surrounding rows; a hover would only get `--surface-ghost` (0.05) — a flatter grey. Fix 2 from the synthesis delivered exactly what it promised.

- **Net zero new components.** The 19-component budget is honoured at 19. Two existing primitives extend by one optional prop. No new files, no new abstractions, no new shapes.

- **Drag-death is visually communicated.** Cards have `cursor: pointer` (was `grab`); the change announces the affordance shift to anyone who knew the previous behavior.

- **The terminal-state collapse (Done card)** preserves audit access (thread visible) while removing the meaningless Request affordance. Spec rule + visual delivery aligned.

- **The orphan-state distinction.** `Rate limit middleware` shows `OPEN THREAD` (mono caps text, no chip) instead of `Thread (0)`. Visual variance signals state variance — the founder learns at a glance that this card has no thread yet without parsing a `(0)`.

- **Cross-grammar consistency with L1 / L11.** Pick → confirm popover → optional note → Cancel/Send is the L1 verdict-bar grammar. Power users who know L1 already know L15. This is the design system's compounding return.

---

## Score recap

**76/90 = 8.4 average.**

**PASS.** Design contract locks. The architect's `/architecture L15` plan inherits:
- The component composition from §2.
- The card layout from §3.
- The verb derivation from §4.
- The posted-message format from §5.
- The behavior contracts from §6.
- The state catalog from §7.
- The mobile rules from §8.
- The accessibility rules from §9.
- The component mapping from §10.
- **The locked rejection list from §11.**
- The six open questions from §12 — these are the only items the architect freely answers.

No iteration needed. The synthesis correctly addressed the variant-A score gaps (Fix 1: increment motion; Fix 2: selected vs hover tint) and pulled in the variant-B unread-chip insight (highest-value polish detail).
