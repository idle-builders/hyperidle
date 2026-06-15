# Variant — "Review pill" (the single routine variant)

**User task (1 sentence).** A founder reviewing a rendered story in the viewer arms select-mode, clicks the element they want changed, writes one note, and repeats — accumulating a round of notes the agent reads back — then closes the round with "New iteration" to start the next pass.

**Signature.** A bottom-left **review pill** that mirrors the top-right toolbar's geometry but carries an *armed* state and an accent edge: the whole annotation loop lives in one persistent pill cluster, and the note popover rises from it rather than chasing the clicked element. One control cluster, one fixed panel — no element-anchored bubbles, no floating draggable window.

## Component composition (named, not "a card-like thing")

All chrome reuses the `viewer.css` toolbar language via a new `.anno-*` namespace. Zero catalogued DS components (they would stamp `data-ds-component` and pollute the annotation surface — see brief Reuse inventory).

| Slot | Element | Class | Notes |
|---|---|---|---|
| Pill cluster | `<div>` fixed bottom-left | `.anno-pill` | Mirrors `.toolbar-pill` geometry (4px pad, 8px radius, `--surface-elevated`, `--border-default`) |
| Arm toggle | `<button>` | `.toolbar-btn` + `.anno-arm` (+ `.toolbar-btn--active` when armed) | Label: `Select` → `Selecting…` when armed |
| Round label | `<span>` | `.anno-round` | `Round 2` — mono, `--text-tertiary`, AQ-013 quiet-label treatment |
| Count | `<button>` | `.anno-count` | `3 notes` — click toggles the list; 0 → `0 notes`, not hidden |
| New iteration | `<button>` | `.toolbar-btn` + `.anno-iterate` | Quiet ghost; `disabled` when current round has 0 notes |
| Note popover | `<div>` fixed, anchored above the pill | `.anno-popover` | Header (target name + element descriptor, mono) · `<textarea>` · Save/Cancel buttons (`.toolbar-btn`, Save gets `.anno-save` accent) |
| List (expanded) | `<ul>` fixed above the pill | `.anno-list` | Read-only; one `<li>` per note this round: target name + first line of note |
| Hover affordance | applied class on hovered story element | `.anno-hover` | `outline: var(--bw-thin) dashed var(--accent-primary)`, `outline-offset: 2px` |
| Selected affordance | applied class on the captured element | `.anno-selected` | `outline: var(--bw-default) solid var(--accent-primary)`, offset 2px |
| Saved indicator | re-applied class on annotated elements on load | `.anno-saved` | `outline: var(--bw-thin) solid var(--accent-primary-dim-derived)` — best-effort, decorative, never blocks Save |

## Information hierarchy (1/2/3)

1. **Arm toggle + its state.** The eye lands on `Select` / `Selecting…` — the one verb that starts the loop. When armed it carries `--accent-primary` (toolbar-btn--active treatment), so "am I capturing?" is answerable at a glance.
2. **Round + count.** `Round 2 · 3 notes` — the founder's sense of "where am I in the review". Quiet (mono, tertiary) until the count is clicked.
3. **New iteration.** Present but recessive (ghost), enabled only with ≥1 note. The pass-closing verb is deliberately last in reading order so it isn't fired by reflex.

The popover, when open, becomes the momentary primary focus (textarea autofocused); the pill recedes behind it.

## States (copy + component names)

- **Empty (first run / round just opened, 0 notes).** Pill reads `Round 1 · 0 notes`. Arm toggle says `Select`. New iteration disabled. No popover. Reads as *ready*, not broken. (AQ-008: any list empty-copy is left-aligned, never centered.)
- **Idle (notes exist, not armed).** `Round 2 · 3 notes`. Saved elements carry `.anno-saved` outlines (best-effort). Clicking `3 notes` expands `.anno-list`.
- **Armed / selecting.** Arm toggle → `Selecting…` + active accent. Cursor over the story area shows `.anno-hover` outline tracking the pointer (mirrors `feedback-overlay.js` `onMouseMove`). `Esc` or a second click on the toggle disarms.
- **Capturing / popover open.** On click in story area: capture target, apply `.anno-selected`, detach the arm listeners (one-shot — disarm), open `.anno-popover` with header `Button · button.btn--disabled "Save"` (the resolved `AnnotationTarget`), autofocused textarea, placeholder `What should change about this element?`. Save → `POST /__annotations` → popover closes, count increments, `.anno-selected` becomes `.anno-saved`. Cancel/`Esc` → popover closes, `.anno-selected` cleared, no POST.
- **Saving (in-flight).** Save button shows `Saving…` and is disabled until the POST resolves; textarea stays editable-locked. On 200 → close. On error → button returns to `Save`, an inline `.anno-error` line appears under the textarea: `Couldn't save — the viewer middleware may be down. Retry?` (AQ-017 spirit, terse for dev chrome). Never loses the typed note.
- **New iteration.** Click → `POST /__annotations/round` → pill label bumps `Round 2 → Round 3`, count resets to `0 notes`, `.anno-saved` outlines clear (prior rounds are immutable history in the file; the viewer just stops decorating them). Disabled again until the new round gets a note.
- **Overflow.** Long target descriptor in the popover header → single-line ellipsis (`text-overflow: ellipsis`, full value in `title`). Long note in the expanded list `<li>` → clamp to first line. The pill never grows: count stays `N notes` regardless of N.

## Behavior — hover / focus / keyboard / motion

- **Arm:** click toggle → attach `mousemove` (hover outline) + capturing `click` listener scoped to the story root (not `document` — avoids the prior art's whole-page trap). Pointer over the pill/popover is excluded from capture.
- **Capture:** first qualifying click → `preventDefault`/`stopPropagation`, `resolveComponentTarget(e.target)`, detach both listeners (one-shot), open popover.
- **Focus:** popover autofocuses the textarea. Focus is trapped within the popover while open (`Tab` cycles textarea → Save → Cancel). `Esc` cancels and returns focus to the arm toggle.
- **Keyboard:** `Esc` disarms (when armed) or cancels (when popover open). `Cmd/Ctrl+Enter` in the textarea = Save. No global keyboard verbs beyond these (founder-filter: no keyboard-verb shortcut menagerie).
- **Motion:** popover and list enter with `opacity` + 4px `translateY` over `--motion-fast` (120ms), `--motion-ease`. Hover/selected outlines are instant (no transition on `outline` — it reads as lag). Honors `prefers-reduced-motion` (tokens collapse to 1ms). Motion budget is deliberately tiny — this is a tool, not a showcase.

## Mobile adaptation

N/A as a product surface — the viewer at `:8098` is a desktop developer tool. There is no three-tab mobile mapping for viewer chrome. If the viewer is ever opened on a narrow viewport, the pill wraps its buttons and the popover goes full-width-minus-12px at the bottom (same `--anno-popover` panel, `left/right: 6px`), but this is not a designed target.

## Trade-offs — what this variant is bad at

- **No element-anchored bubble.** The note popover is fixed to the pill, so the founder's eye travels from the clicked element (bottom of viewport, say) to the bottom-left popover. Mitigation: the `.anno-selected` outline stays lit on the captured element and the popover header echoes the target name. Cost accepted to kill all positioning/clipping math and StrictMode re-anchor bugs.
- **One note per capture.** No multi-select, no batch-annotate. A founder wanting to note five elements arms five times. This matches the concept (one Annotation → one target) and the agent's read model, but it is more clicks than a draw-a-box tool.
- **Best-effort saved outlines.** After reload, `.anno-saved` re-application depends on re-matching the element descriptor against the live DOM; on markup churn it silently under-decorates. By design (architecture §Risks) it never blocks Save and is purely cosmetic — the file is the truth.
- **No live CSS tweaking.** Unlike `feedback-overlay.js`, the founder cannot drag a slider to try `padding: 16px`. Deliberate (concept: annotations carry *intent, not patches*; AJ1: TSX is the single source of truth). The founder describes the goal; the agent edits TSX.
