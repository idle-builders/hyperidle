# Variant — Consolidated persona surface (routine, single variant)

**User task:** founder edits the assistant's persona in the one canonical place and saves; sees clear save feedback.

## Component composition
- Section header: `<h2>` "Assistant" + secondary description (existing pattern, kept).
- Editor: design-system **`Input`** with `textarea` mode.
  - `label="Persona instructions"`, `hint="Shapes how your assistant responds to you. This is the only place to edit it."`, `error={saveError}` when save fails.
  - `rows`/`min-h` from Input default (80px min, resize-y). Font: Input default 15px (NOT mono — persona is prose; drop the `font-mono` the old raw textarea used).
  - This single component replaces the raw `<textarea>` AND the separate error/saved `<p>` blocks (Input owns hint/error rendering via `--status-*`).
- Save: design-system **`Button`** (primary), label `Save | Saving… | Saved`, disabled when clean/saving/loading.
- Saved confirmation: transient — surface via Input `hint` swap to "Saved" in `--status-success`, auto-clears after `--motion-slow`×… (reuse existing 2s timer). No separate success `<p>`.

## Information hierarchy
1. "Assistant" title + one-line description (what the persona does).
2. The persona editor (the work surface — largest element).
3. Save button + inline feedback (bottom-left, dense).

## States
- **loading:** Input disabled, placeholder "Loading persona…", Button disabled.
- **populated (primary):** persona text shown, Button disabled until dirty.
- **dirty:** Button enabled (primary).
- **saving:** Button "Saving…" + disabled.
- **saved:** Button "Saved" (2s), hint shows "Saved" in success color.
- **error:** Input `error="Couldn't save. Try again."` (red border + message via `--status-error`), Button re-enabled.

## Behavior
- Edit → dirty → Save. Cmd/Ctrl+S optional (not required; no new keyboard-verb grammar per founder filter — skip).
- Focus: Input autofocus on tab open is acceptable but not required.
- Motion: border-color transition on focus is Input-native (`--motion-fast`). No extra motion.

## Mobile
Settings is a full-page panel on mobile; Input is full-width. No change.

## Signature
The persona editor IS a design-system `Input` — same chrome as every other field in the app. The surface is unmistakably "a normal Settings form," which is the point: no bespoke pill, no dead tokens, no second editor.

## Trade-offs
- Bad at: rich persona authoring (no markdown preview, no token counter). Acceptable — persona is plain instructions; the 50k cap is generous and silent.
- The "only place to edit" guarantee depends on Settings → Agents removing/disabling the assistant's soul field — a sibling change, not visible in this surface.

## Rejected directions
- **Inline-in-overlay persona editor** (edit persona from the Assistant overlay itself): rejected — conflates "talk to assistant" with "configure assistant"; the overlay is 360px and already dense; Settings is the right home.
- **Markdown editor with live preview** (`BodyEditor`): rejected — over-built for plain instructions; adds a heavier component and a preview pane nobody asked for.
- **Keep two editors but sync them** (Settings → Assistant + Settings → Agents both write, kept in sync): rejected — the AC explicitly demands exactly one editing surface; sync is more code and a guaranteed drift source.
