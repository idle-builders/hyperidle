# Rejected directions (routine — considered, not regenerated)

One line each. These are the X/Y/Z the single "Review pill" variant was chosen against.

- **Floating draggable window (the `feedback-overlay.js` shape).** A 360px draggable panel pinned bottom-right with header/body/sections. Rejected: occupies persistent screen real estate over the very design under review, and the draggable header is fiddly chrome the loop doesn't need. The pill + on-demand popover gives the same controls at a fraction of the footprint.

- **Element-anchored popover (Vibe-Annotations / Figma-comment shape).** Note bubble pinned to the clicked element with a leader line. Rejected: positioning math against dense story layouts and viewport edges is fragile, clips at edges, and re-anchors wrong under StrictMode double-invoke. The fixed-to-pill popover with a target-name header carries the same context with zero geometry.

- **Always-on sticky select mode.** Arm once, every subsequent click captures until explicitly disarmed (prior art's behavior). Rejected: traps the founder — they can't click links, scroll-drag, or use the toolbar without the overlay eating the click. One-shot arm (re-arm per note) is more clicks but never hijacks the viewer.

- **Inline-in-toolbar (extend the existing top-right Toolbar with an annotate pill).** Rejected: the toolbar is theme/density display chrome; folding a stateful capture loop into it couples the two and crowds the top-right corner (and the right-edge scrollbar). A sibling bottom-left cluster reads as a distinct "review mode" and keeps the toolbar's snapshot/behavior untouched.

- **Built from catalogued DS components (`Button`/`Input`/`Popover`/`Badge`).** Rejected: every DS component stamps `data-ds-component` and resolves to a real name under fiber walking — arming select-mode and clicking the overlay's own Save would resolve to `Button`, and the overlay would risk entering the 56-story snapshot net. Plain divs + `viewer.css` `.anno-*` chrome (the path the existing `Toolbar` already took) keeps the overlay out of both the annotation surface and the net.

- **Live CSS tweak sliders.** Rejected: contradicts the concept (annotations carry intent, not patches) and AJ1 (TSX is the single source of truth). The agent edits TSX from described intent; hand-tweaked inline styles must not drive behavior.

- **Per-component annotation files (`Button.md`).** Rejected upstream in `/concept` — rounds are scoped by time/iteration, never by component. Noted here so `/design` doesn't reintroduce a per-component UI affordance.
