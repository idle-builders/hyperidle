# AH3 — Design Critique (reviewer, Phase 2)

Score: **8.5 / 10** — PASS (≥7). Single-variant routine justified; reuse inventory has zero new components; all five overlay states + persona panel are embodied in `overview.png`. Findings are refinements, not blockers.

## 9-dimension scoring

| Dimension | Score | Note |
|---|---|---|
| Hierarchy | 9 | Title→editor→save; notice title→desc→one affordance. Eye lands correctly in 360px. |
| Spacing | 8 | 6px grid; notice 12px padding on-grid. Verify "thinking" row vertical rhythm matches message rows. |
| Typography | 8 | Scale-conformant. **Persona shown in mono in `overview.png`** despite spec saying drop mono (W2). |
| Color | 9 | Warning (setup gap) vs error (failure) split is the real readability win. No dead tokens. |
| Coherence | 9 | Input/Button/ErrorState reuse — same grammar as the app. |
| States | 8 | 4 overlay + 3 notices embodied. **`provider_error` Retry affordance not visible in screenshot** (cropped) — unproven (W1). |
| A11y | 7 | `role="alert"` inherited; affordances are real buttons. **Tertiary "thinking" text on `--accent-primary-dim` tint — contrast unverified** (N1, the design itself flags this). |
| Anti-slop | 9 | One status glyph, dense, no hero, no purple. |
| Premium polish | 8 | Warm shadows, dim tints. Token-granular streaming deferred (acceptable — see arch R3). |
| **Avg** | **8.5** | Above routine bar; no dimension <5, single-variant stands. |

## WARNING

- **W1 — `provider_error` Retry state under-specified for proof.** The overview screenshot crops the `provider_error` card before its affordance; the persona panel shows "Saved" but not the error/dirty states. The design *names* Retry (ghost sm) but does not embody it visually. Builder needs the exact affordance shape (ghost sm Button, label "Retry") and placement nailed so the Playwright no-key/provider-error screenshots have a target. **Fix:** add the Retry-card and persona-error states to the embodied set (or explicitly annotate them in `approved.md` as builder-spec'd) so the screenshot proof for AC2 isn't reverse-engineered.

- **W2 — Mono persona contradicts spec.** `overview.png` renders the persona instructions in a monospace face; `approved.md` line 9 and `comparison.md` both say "Prose font (NOT mono — drop the old `font-mono`)." The mockup contradicts the written contract. **Fix:** regenerate the persona panel in prose font, or the builder will copy the wrong thing from the image. The written contract is correct; the image is wrong.

## NOTE

- **N1 — Thinking-row contrast (self-flagged, keep).** Tertiary text on `--accent-primary-dim` tint must be re-checked at build for WCAG. Design already flags this (comparison A11y note). Carry into the build checklist, don't drop it.
- **N2 — Notice `code` chip allowlist undefined.** `rate_limited` shown in the mockup; design open-Q4 leaves the allowlist to the architect. Acceptable to defer, but the chip is a secret-leak surface (a raw provider message must never reach it). The architecture (§2) correctly maps copy from error *class* and gates the chip to allowlisted codes — design and arch agree. No action beyond ensuring the allowlist is concrete before AH5 screenshots.
- **N3 — Send-disabled-while-in-flight has no embodied state.** `approved.md` says "Send disabled while a turn is in flight." Not shown in any of the five screenshots. Low-risk (it's a Composer disabled state that already exists), but list it as a builder state so it isn't silently dropped.

## Verdict
Clean pass. Two WARNINGs are fidelity gaps between the mockup image and the written contract (mono, Retry-card), not design-direction flaws. The direction — every failure as a first-class in-thread notice, never a dead composer — is the right call and directly serves the load-bearing AC ("never silent"). Rejected directions (toast, generic banner, disabled composer, synced editors) are correctly reasoned in `synthesis.md`.
