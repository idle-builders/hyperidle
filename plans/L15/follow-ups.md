# L15 — Follow-ups

Tracks deferred review findings from the apply-review pass. Each entry has
a concrete next-step. Cross-referenced from `plans/work-packages/follow-ups.md`.

---

## task-card-mobile-bottom-sheet

- **Origin:** L15 apply-review (AR3 / DR6).
- **Issue:** Approved.md §9 mandates a `modal modal-bottom` bottom-sheet at
  viewport ≤ 1024 px (full-width, ≥ 44 px row height). Apply-review
  shipped a smaller fallback: title-row `min-h-[44px]` and a CSS sub-rule
  that bumps menu rows to 44 px (`max-lg:[&_li>button]:min-h-[44px]`) on
  mobile, but the menu is still rendered as the desktop popover, not a
  centred sheet.
- **Fix:** wrap the `<ul>` menu in a viewport-conditional `<dialog
  class="modal modal-bottom">` when `window.matchMedia('(max-width:
  1024px)').matches`. Add a Playwright spec at the mobile viewport that
  opens the kebab and asserts the menu is `[role="dialog"]` with
  `modal-bottom` class.
- **Status:** open.

## auth-middleware-participant-scope (existing — L15 widens footprint)

- **Origin:** Pre-existing L1/L8; reaffirmed by L15 security review SR2.
- **Issue:** Server trusts `X-Identity` header verbatim with `u-founder`
  default. L15 is the first surface that creates founder-attributed plain
  messages from a UI verb path, increasing operational impact.
- **Status:** open (cross-track).

## thread-detail-participant-authz (existing — L15 introduces URL pattern)

- **Origin:** Pre-existing; reaffirmed by L15 security review SR3.
- **Issue:** `GET /api/threads/:id` returns thread + messages without
  participant membership check. L15 ships thread IDs in URLs (history,
  referer leakage). Combined with SR2, leaked URL grants cross-tenant read.
- **Status:** open.

## thread-host-existence-check (existing)

- **Origin:** Pre-existing; reaffirmed by L15 security review SR6.
- **Issue:** `POST /api/threads` accepts any non-empty `hostId` without
  verifying a task with that id exists.
- **Status:** open.

## task-verb-server-validation (existing)

- **Origin:** L15 architecture; reaffirmed by SR5.
- **Issue:** Disabled menu rows render `<button aria-disabled="true">` but
  remain Enter/Space-activatable; the JS handler short-circuits via
  `if (disabled) return`, so behaviour is correct, but server has no
  state-machine bypass guard.
- **Status:** open (documented limitation).

## crypto-randomuuid-secure-context-fallback

- **Origin:** L15 apply-review (SR4).
- **Issue:** `crypto.randomUUID` requires a secure context. On
  `http://<lan-ip>` (non-localhost, non-https) the call throws
  `TypeError`, falling through the narrow `try/catch` as an unhandled
  rejection. Plan §7 declares non-localhost HTTP "not a deployment
  target" but a misconfigured laptop/VPS is realistic.
- **Fix:** add a helper `safeUuid()` that throws an explicit
  `InsecureContextError` and surfaces a real toast; or a polyfill.
- **Status:** open.

## task-thread-agent-participant (existing)

- **Origin:** L15 architecture §4.2.
- **Issue:** Thread bootstrap sets `participants: ["u-founder"]` only —
  task agent missing. Future surface (L18) needs to seed agent identity.
- **Status:** open.

## verb-matrix-spec-amendment

- **Origin:** L15 apply-review (AR4 / A4 / A5).
- **Issue:** `getRequestableVerbRows` extends approved §4.1's 6-state
  matrix to 8 states (adds `hold`, `killed`) and includes `kill` on every
  row. The `done` row renders six greyed verbs vs the spec's terse
  "(others disabled)". Implementer-filled, not designer-locked. The
  implementation is the more-defensive read but should be ratified by an
  approved-design amendment.
- **Status:** open (designer review).
