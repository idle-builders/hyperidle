# Variant C — "Headless + layered" (base hook + presentational shell)

**Composition:** layered. A base behavior layer (`useDialog` hook) that always governs
dismissal/focus/guard/layer, + a thin presentational `<DialogShell>` that consumers fill via
slots (`children`-as-slot). Two exports; behavior and chrome are separable.

## Thesis
The eleven surfaces don't all want the *same chrome* — TaskSheet is a drawer, Assistant is an
anchored popover, GlobalSearch is a command palette, the confirms are tiny. Forcing them into
one fat `<Dialog>` (Variant B) means a pile of escape-hatch props (`renderHeader`, `noChrome`,
`anchored`, `drawer`...) until the component is a fork in disguise. Split the concern: a
**headless `useDialog(options)` hook** owns the *contract* (the part that must be identical —
dismissal grammar, guard, focus trap/restore, layer token, scroll-lock), and returns prop
getters (`getOverlayProps`, `getScrimProps`, `getDismissProps`). A thin `<DialogShell>`
consumes the hook for the 80% case (the form/confirm dialogs); the drawer/palette/popover
surfaces consume the *hook directly* with their own markup. The **contract** is enforced once
in the hook; the **chrome** is free where it must differ. Deviations are flags on the hook,
never forks — because there's nothing to fork; the chrome was never owned centrally.

## The z-layer scale
Same named-token scale as B (`--z-drawer/overlay/scrim/dialog/toast/...`) — but the hook
takes a `layer` option and spreads the resolved `z-index` via `getOverlayProps()`. The scale
is the contract; the hook is how every surface is *guaranteed* to honor it.

## Component composition
- **Export 1 — `useDialog(options)`** (headless): `{ open, onClose, isDirty, modal, layer }`
  → returns `{ getScrimProps, getOverlayProps, getDismissProps, guarding, confirmDiscard,
  cancelDiscard }`. Wires `focus-trap-react`, Esc listener, backdrop handler, guard state,
  scroll-lock, layer resolution. Renders nothing.
- **Export 2 — `<DialogShell>`** (presentational): consumes `useDialog` internally, renders
  the Agent-pair chrome (header+✕, body, footer divider, guard strip). This is what the 8
  form/confirm dialogs use — same ergonomics as B for the common case.
- The 3 oddball surfaces (`TaskSheet`, `AssistantOverlay`, `GlobalSearchPanel`) call
  `useDialog` and render their own bodies — gaining the uniform contract without inheriting
  centered-box chrome they don't want.

## Information hierarchy
`<DialogShell>` chrome = identical to A/B (15/600 title, 18px body, footer divider). The
oddball surfaces keep their existing distinctive layouts but now route dismissal/focus/layer
through the hook — so their *behavior* matches even though their *chrome* differs (correct:
the spec requires consistent dismissal/focus/layer, and consistent chrome only "across
dialogs", which the 8 `DialogShell` users satisfy; drawers/palettes are legitimately
different surfaces).

## All states
Same guard grammar as B (clean→close, dirty→intercept→confirm strip). The difference: for the
oddball surfaces the guard strip is *their* responsibility to render from `guarding` +
`confirmDiscard`/`cancelDiscard` — the hook gives the state, the surface paints it. For
`DialogShell` users it's automatic.

## Behavior
- **Focus/keyboard/motion/scroll-lock**: identical contract to B, but delivered as prop
  getters. `getDismissProps()` carries the Esc + backdrop handlers so a consumer literally
  cannot wire dismissal wrong.
- **`modal` / `layer` / `isDirty`**: hook options, spread through the getters.

## Mobile adaptation
`DialogShell` owns the responsive bottom-sheet rule (like B). Oddball surfaces keep their own
responsive markup (TaskSheet already has its sheet↔drawer split) — the hook is layout-agnostic.

## Signature
**The contract is a hook, the chrome is optional.** A surface can be radically un-dialog-like
(a command palette, a right drawer) and still be provably part of "one dialog experience"
because it threads the same `useDialog` — you can grep for non-conforming overlays by finding
`fixed`+`role="dialog"` that *don't* call `useDialog`.

## Trade-offs (what C is bad at)
- **Two concepts to learn**: a builder must understand hook-vs-shell. Higher conceptual cost
  than B's single import — risks the "component budget" spirit (two exports for one primitive).
- **Guard rendering can drift**: the 3 oddball surfaces render their own guard strip from hook
  state — three chances to render it slightly differently (B renders it once, centrally). Must
  pin with a shared `<DiscardConfirmStrip>` sub-component to avoid re-introducing divergence.
- **Over-engineering risk**: if all eleven surfaces are happy with `DialogShell`, the hook is
  ceremony. The headless split only pays off because TaskSheet/Assistant/Search genuinely
  differ — if AG3/AG-tracks later normalize those, C collapses toward B with extra steps.
- **More test surface**: hook + shell + three bespoke integrations, vs B's one component.
