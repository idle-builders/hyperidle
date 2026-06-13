# AG4 — Rejected directions (considered, not pursued)

- **Persistent shell-level NavStrip (full Variant B).** +40px permanent chrome on every screen; reads as dead on roots (AG2 dead-chrome lesson); pulls eye to chrome above content. Its muscle-memory benefit captured by left-aligning the cluster within each detail header instead.
- **Up wired to `navigate(-1)`.** Re-breaks deep links (concept hard rule, `@lore AE4`).
- **Visible Back/Forward on root/list screens.** Would put a lone disabled chevron on every list — chrome noise. Keyboard-only (⌘[) there.
- **Hiding Back when no history.** Causes layout shift on detail screens; disabled-but-present is the honest, stable choice. (Forward is the exception — absent when no forward history, since a phantom forward affordance confuses.)
- **Browser-native window chrome / Electron BrowserView back button.** Not available — the renderer fills the window; chrome must be in-app.
- **Electron `globalShortcut` for ⌘[ / ⌘] / ⌘1/2/3.** OS-global hotkeys would fire even when the window is unfocused and wouldn't work in browser dev. Renderer-level keydown is correct.
- **A breadcrumb-trail data model / route-metadata registry.** Over-engineered; segments derive from `location.pathname` + already-loaded entity data.
- **WorkTeam's `← Portfolio` chip style as the unified pattern.** It conflates Back and Up visually (a "←" that's actually Up). Replaced by the standard `/`-separated `Breadcrumb`; Back gets its own dedicated chevron.
