# Comparison

Both surfaces are **routine** → one variant each + rejected-direction lists (in each `spec.md`). No 3-way spread required (named existing components + embodied patterns exist for every element; reuse inventory has zero NEW components). Screenshot: `overview.png` (all 5 overlay states + the persona panel).

## Surface 1 — persona surface (single variant)

| Dimension | Chosen |
|---|---|
| Signature | The persona editor IS a design-system `Input` — same chrome as every field. |
| Component count | 2 (`Input`, `Button`) — both existing. |
| Density | Standard Settings form. |
| Primary action surface | Bottom-left Save + inline feedback. |
| State strategy | One layout; states expressed via Input hint/error + Button label. |
| Motion budget | Input focus transition only (`--motion-fast`). |
| Best at | Coherence, zero new shapes, kills the pill + dead tokens. |
| Worst at | No rich authoring (no preview/token count) — fine for plain instructions. |
| Phase-2 critique | 8.5/10 (see below). |

## Surface 2 — overlay states (single variant)

| Dimension | Chosen |
|---|---|
| Signature | Every failure is a first-class in-thread notice — the Assistant is never silent by construction. |
| Component count | Reuses `AssistantOverlay`+`ThreadShell`+`Composer`+`ErrorState` styling; 1 styled thinking row (not a catalogued component). |
| Density | 360px, 2–3 line notices, dense. |
| Primary action surface | One affordance per notice (Open Credentials / Open Agent settings / Retry). |
| State strategy | Distinct shapes: thinking row vs reply message vs notice card; class via `payload.notice.kind`. |
| Motion budget | Thinking row fade-in, opacity only (AQ-014). |
| Best at | Unmissable, actionable failures; warning-vs-error color split. |
| Worst at | Doesn't distinguish transient/permanent provider errors precisely (Retry covers it). |
| Phase-2 critique | 8.5/10. |

## In-session critique (9 dimensions, against `overview.png`)

| Dimension | Score | Note |
|---|---|---|
| Hierarchy | 9 | Title → editor → save; in notices title → desc → one affordance. Eye lands right. |
| Spacing | 8 | 6px-grid padding; overlay 9–12px; panel 18px. Notice padding 12px on-grid. |
| Typography | 9 | 11/12/13/15/16 from scale; 10px micro-labels (allowed). Persona prose drops mono per spec. |
| Color | 9 | Warm tokens only; warning (setup gap) vs error (failure) split is the readability win. No dead tokens. |
| Coherence | 9 | Reuses Input/Button/ErrorState; same grammar as rest of app. |
| States | 9 | All four+three states embodied + screenshotted. |
| A11y | 8 | `role="alert"` on notices (ErrorState native); affordances are real buttons; ≥44px touch floor inherited. Verify contrast of tertiary "thinking" text on dim tint at build. |
| Anti-slop | 9 | No oversized padding, no purple, no hero, one status glyph only, dense. |
| Premium polish | 8 | Warm shadows, dim tints, spinner. Token-granular streaming deferred (acceptable). |
| **Avg** | **8.5** | Above the routine bar; no dimension <5 → no low-confidence fallback to 2 variants. |
