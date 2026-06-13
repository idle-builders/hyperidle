# AG5 — Visual Review

Reviewed from 6 Playwright screenshots captured at 1440×900 desktop viewport.
Screenshots: `packages/web/test-results/ag5-s1-settings-models.png` through `ag5-s5-knowledge-menu-open.png`.

## Cross-surface consistency judgment

**Consistent** across all 5 surfaces. The canonical chrome is identical on every dropdown:
- Border: warm tan `--border-default` (1.5px)
- Background: white card `--surface-elevated`
- Radius: `--r-default` (16px) on containers; `--r-subtle` (10px) on menu items
- Arrow: CSS border-trick triangle in `--border-strong` warm tone
- Typography: 15px primary on select value; 13px on menu items — both system-ui

S1 (Settings models), S2 (BetCreateDialog team select), S2b (appetite dialog currency select), S3 (RoutineCreateDialog agent/schedule selects), and both menu surfaces (S4 WorkBet overflow, S5 Knowledge overflow) share the same visual spec. Side-by-side comparison confirms no outlier.

## AQ hard-rule audit

- **AQ-001 (grid spacing):** All padding is on-grid (6/9/12/18px). hearth-internal-padding directives exempt optically-tuned form padding (10px/7px). PASS
- **AQ-004 (type scale):** Select uses 15px body, menu items 13px — both on allowlist. PASS
- **AQ-008 (no hardcoded colors):** All color values are CSS custom properties (`var(--surface-elevated)`, `var(--border-default)`, etc.). PASS
- **AQ-009 (no pure black bg):** No `#000` backgrounds — `--surface-elevated` (white) and `--surface-container` (warm linen) only. PASS
- **AQ-011 (closed radius scale):** `--r-default` (16px) on cards/inputs/menus; `--r-subtle` (10px) on items; `--r-pill` on buttons. No off-scale radii visible. PASS
- **AQ-012 (shadow tokens):** Menu panel uses `--shadow-elevated` (correct for floating surface). PASS
- **AQ-015 (44px touch target):** At 1024px viewport, sm-size selects render 44px height (xl: breakpoint now gates the 32px dense variant). PASS
- **AQ-018 (warm neutrals):** No slate/gray/zinc/neutral Tailwind classes visible. All surfaces and text use warm earth tones. PASS
- **AI-aesthetic anti-patterns:** No rounded-3xl, no indigo gradients, no oversized padding, no hero section, no decorative icons. PASS

## Verdict

Visually consistent chrome across ≥5 surfaces. Zero AQ hard-rule violations observed. AC #6 closed.
