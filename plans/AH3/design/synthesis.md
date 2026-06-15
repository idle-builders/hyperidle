# Synthesis

Both surfaces are single-variant routine. No cross-variant pulling needed — the reuse inventory had zero NEW components and the in-session critique cleared the bar (8.5/10, no dimension <5).

## Chosen base
- **Persona surface:** design-system `Input` (textarea) + `Button`, single editor, Input-native hint/error feedback.
- **Overlay states:** in-thread notice cards (ErrorState styling) keyed off `payload.notice.kind` + a styled "thinking…" row; three distinct, color-coded, single-affordance notices.

## Explicitly rejected (do not re-litigate)
1. Toast/snackbar for errors — must be persistent in the overlay, not ephemeral.
2. Single generic "Assistant unavailable" — AC requires class distinction (key/harness/provider).
3. Disabled composer + banner — reads as broken; in-thread notice reads as alive.
4. Two synced persona editors — AC demands exactly one editing surface; removal beats sync.
5. Inline-in-overlay persona editing — conflates chat with config; Settings is the home.
6. Markdown editor / preview for persona — over-built for plain instructions.
7. Token-by-token streaming — deferred to a follow-up; thinking→answered satisfies the AC.
8. New keyboard-verb shortcuts (Cmd+S etc.) — founder filter; not added.

## Color contract (load-bearing)
- `missing_key`, `missing_harness` → `--status-warning` (a setup gap the user closes).
- `provider_error` → `--status-error` (something failed). Optional non-sensitive `code` chip.
