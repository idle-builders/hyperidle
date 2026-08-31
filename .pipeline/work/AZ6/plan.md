# AZ6 — Artifacts render as content

## What we need

A user opening an artifact sees the artifact, not a parser error and a wall of its own source.

Artifacts are how agent work becomes reviewable — the thing a founder opens to decide whether work is good. Before this, the flagship kind rendered as "unsupported block — parser-unrecognised" followed by its source, painted uppercase, monospace, centred and greyed, because preview chrome written for a short placeholder caption styled the content it wrapped. The surface where a user judges agent output was the surface that worked least.

What had to become true: an artifact of a kind the product claims to support renders as content rather than source text; preview chrome does not alter the letter case, font family, alignment or colour of what it wraps; an artifact that genuinely cannot be rendered shows an explanation written for a person plus an explicit way to view its source; and the decision about what a preview may render, and under what isolation, is recorded before any code is written. That last one is a safety decision, not a visual one, which is why it was a gate.

Boundary: nothing changes in how artifacts are produced or stored. Out of scope and each needing its own decision — a separate serving origin for artifacts, an application-wide CSP, any artifact-to-app message bridge, per-artifact network allowlists, artifact storage, editing, the permalink's page anatomy and breadcrumb (AZ11), and artifact lists on the team page (AZ9).

## How it works

Rendering is decided per kind:

- `text` renders inline through the same block primitives Knowledge uses — no frame, because prose has no execution surface and a frame would break selection, anchoring and theme inheritance.
- Raw HTML embedded inside a `text` body is sanitised with DOMPurify's default profile and rendered inline, no scripts. One shared `sanitizeHtml` now serves both artifacts and Knowledge, so one class of content has one policy. An agent that wants an app declares the `html` kind.
- `html` runs as its own document in a sealed frame, described below.
- `code`, `image`, `data` and `url` keep their existing inline primitives; they have no execution surface.

The `html` kind runs as its own live document — styles applied, scripts running, buttons clickable — inside a sealed box. Two nested frames do the sealing: a shell document the app composes, rendered in `<iframe sandbox="allow-scripts">` with no `src`, holding nothing but a nested `<iframe sandbox="allow-scripts" srcdoc="…">` carrying the artifact verbatim. Both layers carry the same policy. Nesting is the mechanism, not belt-and-braces: only as a nested context are the artifact's own navigations checked against an embedder's policy, and it is the shell's `frame-src 'none'` that stops `location.href` and `<meta http-equiv="refresh">` from painting an attacker page inside the panel. Loosening only the inner policy changes nothing; that was measured.

The policy grants no origin at all — inline script and style, `data:` for the artifact's own images, fonts and media, and nothing else. It deliberately carries no `'self'` anywhere: in a `srcdoc` document Chromium resolves `'self'` to the embedding app's own origin, so the tokens that looked like a narrow grant were eight channels aimed at HyperIdle itself. The `webrtc 'block'` directive is not enforced by the Chromium this app ships, so the WebRTC constructors are removed from the artifact's document before its script runs, non-writable and non-configurable, with no fresh realm to borrow them from. The artifact lives inside the shell's `srcdoc` attribute, so the escaper that puts it there (`&` before `"`) is security-critical and is tested against breakout payloads.

The sandbox string and the policy live in one srcdoc builder. `ArtifactFrame` exposes no prop by which a call site could loosen either. The frame starts at a readable height and grows to a height the document reports over `postMessage`, clamped — a hostile artifact can lie about its height, hence the cap — and an *Open larger* control puts the identical frame in a `Dialog`. One quiet line sits beneath it: *Runs on its own, in a box sealed off from the app.* It says what the frame is rather than promising what it cannot do.

The preview panel's own styling was split: chrome (surface, radius, padding) stays on the panel; the uppercase-monospace treatment became a class on the gallery caption, where it is honest. Full size is a left-aligned, full-width content host. The unrenderable state uses `isRegisteredKind` plus the existing null-preview check to tell an unknown kind from an empty body from a malformed one, with a sentence for each and a *View source* control only where there is source to reveal.

## How we work on this

Built and reviewed; three review rounds, every blocking finding fixed and each fix shown red by removing its guard. All gates green. The PR is open against main awaiting CI — not merged.

**This is an MVP with an enumerated set of closed channels, not a proof that nothing escapes.** What exists is a list of channels tried, each closed and each shown red by removing its mitigation. A further round would probably find a channel the list does not name; that is the honest expectation.

Accepted limitations, all deliberate:

- Inside its own rectangle an artifact can spin the CPU, allocate memory, refuse to render, or paint something resembling HyperIdle's own interface. There is no watchdog, and its border and caption are the only tell. `Notification.permission` reads `granted` in the desktop build, so an artifact may be able to raise an OS notification — noise, not egress, and not closed.
- The e2e lane is local-only, so the browser proofs do not run per-merge. The component tests asserting the exact sandbox attribute and policy string are the only CI-visible guard against a host or `'self'` returning to the policy — the exact regression that shipped once already.
- `Dialog` caps at 720px, so *Open larger* is larger on a normal window and not on a very wide one. Widening `Dialog` touches every overlay.
- A small image still sits in a full-width bordered box (`ImagePayload`'s figure inside the full-width content host).

Residual risk and deferrals:

- HyperIdle has no CSP anywhere today. A `srcdoc` document inherits the embedding page's policy, so whoever adds an app-wide CSP must exempt or account for the artifact frame or every artifact's inline script dies.
- There is no separate origin to serve artifacts from, and this design does not need one — the opaque origin does the isolating. The day an artifact needs `localStorage`, ES modules or real declared network access, it needs `allow-same-origin`, which needs that origin. That is also the door to being a real MCP Apps host, whose JSON-RPC bridge was deliberately declined here (an artifact has nobody to talk to, and the bridge is the one hole in the box). Its own work package.
- `layers/core-ui/src/index.css:78` points `@source` at `layers/design-system`, which does not exist — the package is under `framework/`. No utility class used only inside the design system has ever been generated. The list markers here ship as an inline style with lore explaining why. Fixing the glob is a one-line change with an unknown visual blast radius and needs its own pass with screenshots.

Two lessons this work paid for twice. A config borrowed from a spec has to be re-read against your own architecture line by line: the isolation shape came from MCP Apps but their frames sit on a host-controlled resource origin, and the policy tokens whose safety depended on that piece were kept anyway. And an assertion nobody has watched fail is not evidence — a listener recording `/META-REFRESH` while the test compared `META-REFRESH`, a list-marker class assertion green in jsdom while the bullets were invisible on screen, and a whole seal spec green because its only observer was a third-party origin.

Reproducing the e2e proofs: confirm port 5179 is free and set `CI=1`. `playwright.config.ts` reuses an existing server, so a sibling worktree's stale server will answer silently and report the pre-change DOM.
