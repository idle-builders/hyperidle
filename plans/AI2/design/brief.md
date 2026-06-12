DESIGN-CLASS: novel  ref=none  pattern=none

# AI2 — One dialog experience — Interrogated brief

A new design-system primitive family. No existing DS component owns "dialog/overlay"; no
`packages/design-system/html/` pattern embodies it. Per the skill's hard rule, new DS
primitives are always `novel` → three radically different variants exploring the **shape
itself** (container vs self-contained vs layered).

## The user task

Two founders manage a fleet of AI agents all day. They open dialogs constantly: confirm a
bet kill, type a bet pitch, write a knowledge note, add an agent, change a scope, glance at
a task sheet, chat with the Assistant, scan notifications, search globally. The decision
each dialog asks for differs; the **dismissal/focus/layer contract** must not. The user
learns the grammar once. The single worst outcome the spec names: losing typed work to one
accidental Escape or backdrop click.

## Inventory — the eleven surfaces, three implementation families, four layer mechanisms

Read in full. Family (impl strategy) and current layer noted.

| # | Surface | Family | Layer today | Has unsaved input? | Dismissal today |
|---|---|---|---|---|---|
| 1 | `AgentAddDialog` | DaisyUI `modal-box` in native `<dialog>` | top-layer (showModal) | yes (name/soul/config) | Esc closes (native), backdrop closes (form method=dialog), ✕ |
| 2 | `AgentEditDialog` | DaisyUI `modal-box` in native `<dialog>` | top-layer | yes | same as #1 — **the reference pair** |
| 3 | `KnowledgeCreateDialog` | bare native `<dialog>` + JSDOM guard | top-layer | yes (title/body editor) | Esc closes & discards; off-scale 14px heading + undefined `font-heading` |
| 4 | `ScopeChangeDialog` | bare native `<dialog>` + JSDOM guard | top-layer | confirm-ish | Esc closes |
| 5 | `BetCreateDialog` | bare native `<dialog>` + JSDOM guard | top-layer | yes (pitch editor) | Esc closes & **discards the pitch** — the headline bug; `font-heading` undefined |
| 6 | `RoutineCreateDialog` | bare native `<dialog>` + JSDOM guard | top-layer | yes | Esc closes & discards |
| 7 | `WorkBet` ConsequencePreviewDialog (kill) | bare native `<dialog>` + **cancel-event block** | top-layer | yes (kill reason) | Esc **blocked**, backdrop **blocked** — inconsistent with #5 |
| 8 | `WorkBet` AppetiteDialog | bare native `<dialog>` + cancel-event block | top-layer | yes | Esc blocked |
| 9 | `TaskSheet` | hand-rolled `fixed` div, own focus snapshot/restore | **z-50** | no (read + actions) | drawer/bottom-sheet, no backdrop dismiss wired uniformly |
| 10 | `AssistantOverlay` | hand-rolled `fixed` div, hand-rolled focus + Esc | **z-30**, `aria-modal=false` | yes (composer) | Esc closes; **deliberately NO click-outside** (L21 lore) |
| 11 | `NotificationPopover` | hand-rolled `fixed` div | **z-30** | no | — |
| (12) | `GlobalSearchPanel` | DaisyUI `modal modal-open` + `focus-trap-react` | **z-50** | transient query | Esc + backdrop close |
| (13) | `AppShell` mobile drawer | hand-rolled `fixed` + `focus-trap-react`, scrim **z-40** | **z-50** drawer / **z-40** scrim | no | scrim click + Esc |

Spec says "eleven"; GlobalSearchPanel and the mobile drawer are the two extra shell surfaces
that share the same contract debt — they're in scope for the layer/focus contract.

### The four competing layer mechanisms (root cause)
1. **Native top-layer** (`showModal()`) — Agent/Knowledge/Bet/Routine/WorkBet dialogs. Always
   paint above everything, ignore `z-index` entirely. This is invisible and undocumented.
2. **`z-50`** — GlobalSearchPanel, TaskSheet, mobile-drawer all collide here.
3. **`z-40`** — mobile scrim only.
4. **`z-30`** — AssistantOverlay + NotificationPopover collide; stacking decided by DOM order.

### The duplicated boilerplate
The ~25-line "sync open prop ↔ native dialog with JSDOM `showModal` fallback" block is pasted
into #3, #5, #6, #7, #8 (and KnowledgeCreate). The cancel-event Escape-block is pasted into
#7, #8. Focus handling is implemented four ways (#1/2 rely on native; #9 snapshots
activeElement; #10 hand-rolls querySelector focus; #12/13 use focus-trap-react).

## Reuse inventory (Phase 0b)
- **`focus-trap-react`** — already a dependency, already used in two shell surfaces. The
  obvious focus-trap engine; do not hand-roll. (Variant B/C lean on it.)
- **Native `<dialog>` element** — gives backdrop, top-layer, Esc-to-cancel, focus-in,
  inert-the-rest **for free**. The Agent pair proves it works in this codebase. (Variant A
  leans on it.) Cost: JSDOM doesn't implement `showModal()` (the boilerplate's whole reason);
  top-layer can't be z-ordered relative to non-dialog overlays, so mixing native dialogs with
  `fixed` overlays reintroduces the layer ambiguity unless ALL overlays are native dialogs.
- **DaisyUI `modal` / `modal-box` / `modal-backdrop`** — chrome classes the Agent pair and
  GlobalSearchPanel already use. Reusable styling, but carries DaisyUI defaults (cool radii)
  we override anyway.

## Probes (resolved — autonomous mode, read confirmed against spec)
1. **New primitive or extension?** New. Variants explore the component shape. Resolved.
2. **The guard rule — what is the encoded RULE, not the case list?** This IS the central
   design decision; each variant proposes a different encoding. The spec demands "encode the
   rule, don't case-by-case it." My read of the correct rule (carried into all variants, the
   variants differ on *mechanism* not *policy*):
   > **A dialog guards dismissal iff it holds dirty user input.** Escape and backdrop-click
   > are *dismissal intents*. On a dismissal intent: if the dialog is clean → close freely;
   > if dirty → intercept once and surface a discard confirmation (the guard). The close
   > affordance (✕ / Cancel button) is an *explicit* intent and also routes through the guard
   > when dirty. Confirmations (kill bet) are clean (a reason field that's empty is clean;
   > once typed, it's dirty and guarded — which is *better* than today's hard-block because
   > Escape on an empty confirm should just close). Non-modal surfaces (Assistant) set a flag
   > to opt out of backdrop-dismiss entirely; they are never "modal."
3. **Modal vs non-modal composition** — one primitive, a `modal` flag (default true).
   `modal=false` ⇒ no scrim, no backdrop-dismiss, page stays interactive, focus moves in but
   is not trapped. AssistantOverlay composes this; it is not a fork.
4. **Most common state?** Populated (a form or a confirmation). Loading/error are the
   *content's* concern, not the dialog chrome's — the primitive renders whatever children it's
   given. The primitive owns chrome + behavior, not content states.
5. **Mobile?** Hard requirement: every dialog fits 375px. Resolved as: dialog max-width
   capped, full-width minus gutter at narrow viewports, max-height with internal scroll,
   bottom-anchored on phone for thumb reach (sheet-like). TaskSheet's existing
   bottom-sheet↔right-drawer responsive split is the proven pattern to generalize.

## Anti-convergence axes the three variants must spread on
- **Layer mechanism** (the root cause): A = all native top-layer; B = all React portal +
  single z-scale; C = headless hook, consumer-chosen host.
- **Where the guard lives**: A = native `cancel` event interception; B = primitive-owned
  `isDirty` prop + confirm sub-state; C = a `useDismissGuard` hook the consumer wires.
- **Component count / API surface**: A = one component, thin; B = one component, fat
  (owns scrim, focus, guard, sizing); C = hook + thin presentational shell (two exports).
- **Composition model**: A = container-with-payload; B = self-contained block; C = layered.

## Out of scope (binding)
Dropdown/popover *menus* (AG5). Bet authoring journey (AG3) — but BetCreateDialog migration
IS in scope (AG3 not started). Toast positioning. New dialog features (resize, >2-deep stacks).
No behavior change beyond dismissal/focus/layer. No data/process-layer changes. AI1 owns the
dead-token gate and runs concurrently on tokens.css — a NEW z-scale/scrim token must be added
cleanly and flagged for overlap.
