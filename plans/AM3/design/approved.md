# AM3 — Session dial-in & activity view — APPROVED design

DESIGN-CLASS: novel — proceeds to `/human-design-review` after design-critique; parks for the founder in an autonomous run.

## Chosen direction: non-modal right slide-over (Variant A + Variant C mechanics)

A dismissible right **slide-over** dial-in opened from a `session-reference` in the conversation. The conversation stays mounted and readable at left (not a modal). Three stacked zones in the panel:

1. **Header** — `Session` tag · agent name · host task · `StatusChip` (live/ended) · close ✕. Mirrors `ConversationHeader` so the sub-room reads as the same product.
2. **Config band** (`--surface-container`) — a `Fold` ("Configuration · Hide/Show") over `DialInControls`: one control per option the harness DECLARES, rendered inline-compact. Foldable to give activity the height while auditing.
3. **Activity** — `What happened` mono micro-label + **`PartList`** over `derivePartsFromSession()` — the SAME renderer the conversation uses. Each activity entry (a tool call) renders as one calm agent `prose` Part. (Scope: the live activity stream carries only `tool_call` entries today — no edit/diff entry exists, so the activity column shows tool-call prose, not diff chips. Diff capture is a later WP — see architecture.md, critique resolution round 1.)

**Embodiment story:** `packages/web/src/components/SessionDialInSide.stories.tsx` → "SessionDialIn · A Side panel" (screenshot: `a-side-panel/screenshot.png`). Shared controls/fixtures: `packages/web/src/components/sessionDialInFixtures.tsx`.

## Rejected (do not re-litigate — see synthesis.md)
- Dedicated `/session/:id` **route** (Variant B) — reads as a first-class session surface (brushes the lower-level constraint), heaviest build.
- **Modal Dialog** as primary placement (Variant C) — blocks steer-while-reading; modal is poor for sustained auditing. Its *behavior* (focus/escape/dismiss) is pulled into A; its scrim is not.
- Promoting session activity into the conversation column — hard-rejected (AM1 hard-rule 3): a session appears only as a `session-reference` Embed.
- A second/parallel activity renderer — activity renders through `PartList` only.
- Per-backend control branching — controls come from the descriptor's declared options only.

## Component mapping (zero new DS primitives)

| Slot | Component | Props / notes |
|---|---|---|
| Panel container | web `<aside>` (NEW composition `SessionDialIn`) | non-modal slide-over, 460px, `--border-default` left, `--shadow-elevated` |
| Header | hand-rolled strip (mirrors `ConversationHeader`) + `StatusChip` | `status="success"` ended / `"info"`+LiveDot live |
| Config disclosure | `Fold` (DS) | `label="Configuration"`, `cta="Hide"/"Show"` |
| Config controls | `DialInControls` (NEW web composition) | renders one control per `HarnessModelOptionDescriptor`; `select`→pill row, `boolean`→`Checkbox`, `number`/`text`→`Input` |
| Model selector | pill row over `descriptor.models.filter(selectable)` | active pill = accent ring + `--accent-primary-dim` |
| Activity column | **`PartList`** (web) | over `derivePartsFromSession(...)` — AC3/AC4. Each `tool_call` entry → one agent `prose` Part. No diff Embed this WP (no edit/diff entry in the stream — see architecture critique resolution round 1). |
| Session entry (in conversation) | `Fold cta="Show session"` (already built, AM1) | opens this panel |

## States (build-phase — initial design renders populated only)
- **Populated** — config + ended activity (shown).
- **Live/running** — `StatusChip` "Live" + `LiveDot`; activity auto-scrolls (carry `SessionActivityPanel`'s scroll-pause logic); no ended chip.
- **Empty activity** — `EmptyState` compact ("No activity yet").
- **Error** — `ErrorState` in the activity zone; config band still usable.
- **Descriptor declares no options** for the selected model — config band shows the model row only; effort/mode/permission rows are ABSENT (AC2 proof).
- **Unknown activity event kind** — degrades to the `unknown` Part (PartList already handles this, no throw).

## Behavior + motion + keyboard
- Open: the `session-reference` `Fold` → `onOpen({route:"session", sessionId})`; the conversation page opens the panel (panel-open is page state; the `session` `OpenTarget` route is the seam AM3 fills). Focus moves to the panel header.
- Close: ✕ / Escape → panel closes; focus restores to the originating Fold. (Pulled from C; implemented WITHOUT a modal scrim — non-blocking.)
- Config Fold collapses controls to reclaim activity height.
- Pill select: click to set; active pill accent ring + dim fill; `boolean`→toggle; `number`/`text`→`Input`.
- Motion: panel slides in via `transform: translateX` over `--motion-default`; honors `prefers-reduced-motion` (opacity-only). No layout-property transitions.

## Mobile adaptation
Panel becomes a full-height bottom-up sheet over the conversation tab; ✕ returns. Config folds by default on mobile to prioritize activity. Inputs ≥16px (AQ-005).

## Open questions for the architect — RESOLVED (see architecture.md "Critique resolution (round 1)")
1. **Part-kind extension vs prose-only.** Activity tool-calls/reasoning render as `prose` Parts today (per AM1 concept §Part). Does AM3 ADD a Part kind (e.g. `activity`/`tool-call`) to the closed `PartKind` union for richer activity affordances, or stay prose+Embeds? Default recommendation: stay `prose` + the existing `diff` Embed (zero renderer change, honors AC3 "no duplicated renderer"). If a tool-call needs distinct chrome, extend the closed `PartKind` union (and its exhaustive dispatch) — never a parallel renderer.
2. **`derivePartsFromSession` input shape.** It must take session activity events (`ActivityEntry` from `useSessionActivity` / `HarnessEvent` normalized) and the agent identity, and return `Part[]`. Confirm the source type the adapter consumes (normalized activity, NOT raw `HarnessEvent` per backend) so the renderer stays source-agnostic and AC4 (cross-backend uniformity) holds.
3. **Config persistence scope.** `HarnessModelOptionDescriptor.scope` is `"launch" | "durable"` — does the dial-in WRITE config (and to where — agent `modelTierPreference`/`reasoning`, or a session-launch payload), or is AM3 read-config-only this WP? Recommendation: surface controls + emit an `onConfigure(change)` callback; the persistence endpoint is the architect's call (likely launch-scope to the session, durable-scope to the agent).
4. **Entry route wiring.** The `session` `OpenTarget` is a no-op until AM3. AM3 binds it to open the panel for `sessionId`. Confirm whether opening is panel-state on the conversation page (recommended) vs a real navigable URL param (would drift toward rejected Variant B).
