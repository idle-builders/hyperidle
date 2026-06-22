DESIGN-CLASS: novel  ref=PartList(activity-render)+SessionActivityPanel(superseded)  pattern=none(placement+config-controls)

# AM3 — Session dial-in & activity view — design brief

## What is being designed

A **lower-level session surface** — the "dial-in" — entered *when needed* from a session reference in a conversation, never in the default conversation flow. Two jobs:

1. **Configure** the session: model + the options the harness DECLARES (effort, mode, permission), rendered DECLARATIVELY from AM2's `HarnessCapabilityDescriptor`. An option the harness does not declare is ABSENT.
2. **See what happened**: the session's activity (tool calls, edits, diffs, reasoning) rendered REUSING AM1's Part rendering structure (`PartList` + a `derivePartsFromSession` adapter) so it reads uniformly with the conversation.

The carried design axis (resolved by rendered variants, not pre-decided): **how dial-in is ENTERED and PLACED** — a slide-over panel beside the conversation, a dedicated route, or a modal overlay — and **where the config controls sit relative to the activity**.

## Who / what decision

The founder, occasionally, dropping a level below a conversation: either to *steer* a session (the default model/effort is wrong for this task) or to *audit* what an agent actually did. Both are deliberate, low-frequency, "look beneath" acts — not the 90% conversation surface. The dial-in must feel like a quiet sub-room, not a promoted panel.

## Hard constraints (from spec + memory)

- Activity renders through AM1's **Part structure** — `PartList`, the same source-agnostic renderer the conversation uses. NO duplicated renderer. The `derivePartsFromSession()` stub in `packages/shared/src/part.ts` is the seam.
- Controls render from AM2's **capability descriptor** — NO per-backend branching. `HarnessModelOptionDescriptor.control` (`select | boolean | number | text`) drives the control kind; undeclared options are absent.
- Dial-in is **lower-level** — it must NOT promote session activity into first-class conversation content. The conversation references a session via a `session-reference` Embed (already built, renders as a `Fold` "Show session"); opening that is the entry into this surface.
- **No color/token changes** — Hearth palette + tokens unchanged. Structure + style only.
- Memory: initial variants render ONLY the populated real state — no skeleton/loading/error/empty.
- The same session reads uniformly regardless of which backend produced its activity (the Part adapter normalizes; the renderer never sees a harness type).

## Phase 0b — Reuse inventory

| Visual element | Renders via | New? |
|---|---|---|
| Activity stream (tool/edit/diff/reasoning) | **`PartList`** (web) over `derivePartsFromSession()` output | reuse — the whole point |
| A tool-call / reasoning line | a **Part** (prose kind today; arch decides whether to extend PartKind) | reuse renderer |
| A diff embed in activity | `ReferenceChip kind="artifact"` via the existing `diff` Embed | reuse |
| Session-reference entry chip (in conversation) | `Fold cta="Show session"` (already built, AM1) | reuse |
| Config control — `select` option (model, effort, mode, permission) | **`Menu`** (DS) trigger + dropdown, or a labeled select row | reuse Menu |
| Config control — `boolean` option | `Checkbox` (DS) / toggle | reuse |
| Config control — `number`/`text` option | `Input` (DS) | reuse |
| Config control labels | `KeyValue` (DS) for the label↔control row | reuse |
| Dial-in header (agent · model · status) | hand-rolled strip (mirrors `ConversationHeader`) + `StatusChip` for live/ended | reuse StatusChip |
| Slide-over / overlay container | `Dialog` (DS, `DialogSize`/`DialogLayer`) for the overlay variant; a flex panel for the side variant | reuse Dialog |
| Config section disclosure | `Fold` (DS) to collapse the controls when auditing | reuse |
| `NEW` | a thin **`SessionDialIn`** web surface that composes the above (header + controls + PartList). It is genuinely new because no surface today both configures-from-descriptor AND renders activity-as-Parts. It is a *composition*, not a new primitive — zero new DS shapes. | NEW (composition only) |

No new design-system primitive. The dial-in is a web composition over existing DS components + the AM1 renderer.

## Classification rationale (novel)

- Axis 1 (existing component reference): partial — the activity render reuses `PartList`, but the *placement* and the *config-control surface* name no existing component.
- Axis 2 (pattern match): no — `SessionActivityPanel` exists but explicitly does NOT use the Part structure and has no config surface; it is the thing AM3 supersedes.
- Both placement and the descriptor-driven config surface are genuinely open → **novel**. Three variants on the placement/composition axis.

## Variants (placement axis)

- **A — Side panel (slide-over beside the conversation).** Dial-in opens as a right-docked column; conversation stays visible at left. Config at the top of the panel, activity below in a single calm column. Thesis: dial-in is a *companion to the conversation you came from* — you never lose context.
- **B — Inspector route (dedicated full surface).** Opening the session-reference navigates to `/session/:id`. A full-width sub-room: header strip, a left controls rail, activity as the main Part column. Thesis: a session is a real place you can deep-link and audit; controls and activity both get room.
- **C — Overlay sheet (modal dial-in).** A centered `Dialog` sheet floats over a dimmed conversation. Compact: config as a single collapsible header band, activity as the Part column filling the sheet body. Thesis: dial-in is a *momentary* act — open, steer or glance, dismiss; it deliberately resists becoming a place you linger.
