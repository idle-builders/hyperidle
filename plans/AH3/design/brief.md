DESIGN-CLASS: routine  ref=AssistantOverlay+ThreadShell+Input+Button+ErrorState  pattern=ErrorState.html+Input.html

# AH3 Design Brief

Two UI surfaces, both **routine** (named existing components + analogous embodied patterns exist):

## Surface 1 — Consolidated persona surface (Settings → Assistant)
The ONE place to edit the assistant persona. Today: `SettingsAssistant.tsx` uses a raw `<textarea className="textarea textarea-bordered">` (pill) + raw `<button className="btn">` + dead `--color-error/success` tokens. Rebuild on design-system `Input` (textarea mode — already rectangular) + `Button`. Settings → Agents must stop offering a second editor for the assistant agent.

## Surface 2 — Assistant overlay states
The `AssistantOverlay` (popover, 360px, bottom-right) must show: idle (composer ready), **streaming** ("thinking…"), answered (reply visible), and **three distinct error/guidance states** (missing key / missing harness / provider error). The Assistant is NEVER silent.

## User task
A founder messaging the Assistant for the first time, right after onboarding. Decision they make: "is this thing alive, and if not, what do I fix?" The design's job: make a live reply obvious, and make every failure a one-glance, one-click-to-fix guidance message — not a dead composer.

## Primary state (most common in real use)
- Surface 1: **populated** (a persona already exists; user tweaks + saves).
- Surface 2: **answered** in the happy path; but the error states are the load-bearing design work — a misconfigured first run is common and is the whole reason this WP exists.

## Reuse inventory (hard gate)

| Element needed | Existing component | New? |
|---|---|---|
| Persona multi-line editor | `Input` (textarea mode) — rectangular, `--r-default`, resize-y, min-h-80 | reuse |
| Save button | `Button` (primary) | reuse |
| Save feedback (saved/error) | `Input` `hint`/`error` props (use `--status-*`, not dead tokens) | reuse |
| Overlay shell / composer / message list | `AssistantOverlay` + `ThreadShell` + `Composer` | reuse |
| "Thinking…" streaming indicator | DaisyUI `loading loading-spinner` (already used in overlay loading branch) + a styled row | reuse + 1 styled row (not a new ds component) |
| Error / guidance block in-thread | `ErrorState` (has icon + title + description + retry pill) — adapt copy + affordance | reuse |
| Action affordance (link to Settings tab) | `Button` (ghost/link) or existing nav | reuse |
| Notice discriminator on a message | `payload.notice.kind` (data, not a component) → overlay branches to `ErrorState`-style render | reuse |

**Zero NEW design-system components.** The streaming indicator is a styled row composed from existing primitives, used only inside the overlay (does not meet the 2-context bar for a new catalogued component).

## Constraints
- Hearth tokens only (AQ-008/018). `--status-error/warning/success`, `--accent-primary`, `--r-default/subtle`. No `--color-error/success` (dead — AI1 fixes; AH3 avoids).
- Overlay is 360px wide — guidance copy must fit ~2-3 lines; one primary affordance per notice.
- Desktop-first; overlay already maps to mobile (full-width sheet via existing dialog behavior).
- No AI-aesthetic: no oversized padding, no decorative icons beyond the one ErrorState status glyph, dense.
