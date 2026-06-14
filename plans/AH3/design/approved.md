# AH3 — Approved Design (input contract to /architecture)

Routine, single-variant per surface. Zero NEW design-system components. Embodied in `mockup.html` → `overview.png`. Architecture must NOT re-decide hierarchy, component vocabulary, or interaction grammar.

## Surface 1 — Consolidated persona surface (Settings → Assistant)

**Components:** design-system `Input` (textarea mode) + `Button` (primary). Replaces the raw `<textarea className="textarea textarea-bordered">` + raw `<button className="btn">` + the dead `--color-error/success` `<p>` blocks in `SettingsAssistant.tsx`.

- `Input`: `textarea`, `label="Persona instructions"`, `hint="Shapes how your assistant responds. Edited in exactly one place."`, `error={saveError}` on failure. Prose font (NOT mono — drop the old `font-mono`). Input default min-h 80px, resize-y, `--r-default` (rectangular, the pill fix).
- `Button` (primary): label `Save | Saving… | Saved`; disabled when clean/saving/loading.
- Saved feedback: transient success via hint text in `--status-success` (~2s), then clears. No separate success `<p>`.
- Header: keep `<h2>Assistant</h2>` + one-line description.

**States:** loading (disabled + "Loading persona…") / populated (primary) / dirty (Save enabled) / saving / saved / error (Input `error` red border + message via `--status-error`).

**Single-editor guarantee:** Settings → Agents must NOT offer an editor for the assistant agent. Filter `role==="assistant"` agents out of the `SettingsAgents.tsx` editable table (they have their own tab). Team agents keep their soul editor there (and that soul textarea also migrates to `Input textarea` — the 2nd rectangular-textarea proof instance).

## Surface 2 — Assistant overlay states

**Shell:** existing `AssistantOverlay` (360px) + `ThreadShell` + `Composer`. No structural change.

### States
- **idle:** default ThreadShell + Composer; seeded welcome visible on first open.
- **streaming:** after send, user message appears immediately; a "**Assistant is thinking…**" row (DaisyUI `loading-spinner loading-sm` + tertiary text on `--accent-primary-dim` tint) shows until the first assistant `thread_message_appended` for this thread. Fade-in `--motion-fast`, opacity only.
- **answered:** thinking row replaced by the assistant `plain` reply (existing message render + `renderToolCallSummaries`). Must be a real model response, visibly distinct from the seeded welcome text.
- **three error/guidance notices** — in-thread notice cards (ErrorState styling), keyed off `message.payload.notice.kind`:

| kind | Color | Title | Description | Affordance |
|---|---|---|---|---|
| `missing_key` | `--status-warning` | No API key yet | I can't think until an API key is set. Add your Anthropic key to get started. | primary sm → Settings → Credentials |
| `missing_harness` | `--status-warning` | Runtime not configured | I don't have a runtime selected. Pick a harness for me and I'll be ready. | primary sm → Settings → Agents |
| `provider_error` | `--status-error` | Couldn't reach the model | The model provider returned an error. This is usually temporary. (+ optional non-sensitive `code` chip, e.g. `rate_limited`) | ghost sm → Retry (re-runs the turn) |

- Notice card: ~12px padding, 13px title/600, 12px description, exactly ONE affordance, fits 360px in 2–3 lines. `role="alert"`.
- **Never leak secrets:** copy is fixed per class (mapped from the error *class*, never `error.message`); only allowlisted non-sensitive `code` strings may appear in the chip.

**Behavior:** Send disabled while a turn is in flight for the thread (no stacked turns). Affordances route to Settings tabs (existing nav) or fire Retry. Escape closes overlay (existing). No new keyboard shortcuts.

## Mobile
Settings panel full-width; overlay maps to full-width sheet via existing dialog behavior; notices/thinking row width-fluid. No new mobile work.

## Token contract
`--status-warning` (setup gaps), `--status-error` (failures), `--status-success` (saved), `--accent-primary`/`-dim`, `--r-default` (textarea), `--r-subtle` (notice cards). NO `--color-error`/`--color-success` (dead; AI1 owns; AH3 avoids).

## Open questions for the architect
1. `payload.notice.kind` discriminator — confirm extending `PlainPayload` with optional `notice?: { kind; code? }` (architecture §design-it-twice §B chose this) over a new MessageType.
2. Retry affordance must re-run the turn for the last user message — confirm the trigger accepts a re-run path (re-fire `runAssistantTurn` for the existing trigger message).
3. Streaming granularity: thinking→answered (locked) vs token-granular (deferred). Confirm the AC "streaming response" is satisfied by thinking→answered (architecture §3 / R3).
4. Allowlist of non-sensitive provider `code` values surfaced in the chip (e.g. `rate_limited`, `overloaded`); default to NO chip when uncertain.
