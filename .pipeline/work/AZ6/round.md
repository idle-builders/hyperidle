# AZ6 — Artifacts render as content

Combined round: requirement, shape and technical plan in one artifact. Nothing is built until this is approved.

**Revision 2 (2026-08-11).** §3 was rejected. The first version treated every artifact body as rich text to be sanitised. That is wrong for the `html` kind: stripping scripts deletes the thing that makes an artifact valuable. §3 is rewritten as an isolation decision, split by kind, and backed by measurements I took on this machine plus a written third-party specification. §4, §5 and §6 follow it. §1 and §2 stand, with the `html` evidence promoted.

---

## 1. What is actually broken

I ran the real app from this worktree (vite on 5188, real production components, artifact API responses mocked at the network) and opened real artifact permalinks. The two screenshots that carry the outcome are kept as before/after pairs in `probes/before/` and `probes/after/`; the rest were pruned on review, along with the throwaway scripts that drove them.

**`probes/before/az6-text.png`** — a realistic agent document (headings, list, table, a `<details>` block, a code fence). It paints in uppercase monospace, pushed into a centred column, bullets gone. Measured on the rendered `<h1>`: `text-transform: uppercase`, `font-family: ui-monospace…`. The author's letter case is destroyed. The `<details>` block renders as an orange **UNKNOWN — UNSUPPORTED BLOCK — PARSER-UNRECOGNISED** stripe with its own source underneath.

**`probes/before/az6-html.png`** — an artifact of the `html` kind, which the product accepts at creation. The whole artifact is that same UNKNOWN stripe plus its raw HTML source. **This is the interactive-artifact case, and today it does not render at all.**

The same defect was reproduced on a plain markdown artifact (same uppercase/monospace treatment, bullets gone) and on an artifact of a kind the registry does not know (same stripe, pretty-printed JSON as the body). Those two screenshots said nothing the two above do not.

### Where each defect lives

| What | Where |
|---|---|
| The preview panel declares content typography for itself | `framework/design-system/src/ArtifactPreviewSurface.tsx:26-29` — `SURFACE_BASE` carries `font-mono text-[11px] uppercase tracking-… text-[var(--text-tertiary)] items-center justify-center`. Those classes were written for the short "No preview" caption; they inherit into whatever the panel wraps. Applied at line 117. |
| Full size never gets horizontal alignment corrected | line 113 flips `items-center` → `items-start` (cross axis) but `justify-center` (main axis) stays, so content sits in a centred column. |
| The renderer is called without an HTML handler | line 87: `composeArtifactBody(kind, preview)` — the third parameter is never passed. |
| …so every HTML path falls to the unknown state | `framework/design-system/src/kinds/compose-artifact-body.tsx:132-135` (the `html` kind) and `framework/design-system/src/block/render-payload.tsx:43-45` (an html block inside a markdown body). |
| The unknown state is machine language | `framework/design-system/src/block/UnknownPayload.tsx:15-34` — an `UNKNOWN` pill, the string `unsupported block — {reason}`, and a `<pre>` of the source. No explanation, no deliberate choice to view the source. |
| An unknown *kind* uses the same block-level fallback | `compose-artifact-body.tsx:185-188` — `JSON.stringify(preview, null, 2)` into that same stripe. |

For prose, the fix has a precedent inside the product: `layers/core-ui/src/pages/knowledge/KnowledgeBody.tsx:54` renders agent-authored markdown correctly through the same block primitives. Artifacts render the same markdown through the same primitives with the HTML handling left out.

---

## 2. The requirement, sharpened

**Nouns.**
- **artifact kind** — one of six strings, defined in `framework/domain-model/src/kinds/registry.ts:252-262`: `text`, `code`, `image`, `data`, `html`, `url`. The create endpoint accepts exactly these (`layers/core-api/src/routes/artifacts.ts:29-30`). Any other kind can only arrive from an old database row.
- **preview** — the artifact's stored body, per-kind shaped, validated on read (`artifacts.ts:63-105`). A shape that fails validation becomes `null`.
- **preview surface** — `ArtifactPreviewSurface`, the panel. Two sizes: `gallery` (a one-line summary) and `full` (the content).
- **renderer** — `composeArtifactBody`, which maps a kind to primitives shared with Knowledge and comments.
- **source view** — the artifact's own text or JSON, shown as code, only when the user asks for it.

**Each acceptance criterion as a condition that can be checked.**

1. A `text` artifact shows headings, paragraphs, lists, tables and code as rendered elements, with zero unknown-block stripes. An `html` artifact shows its own document — its styles applied, its scripts running, its buttons clickable.
2. On the permalink, the element wrapping prose resolves to `text-transform: none`, the sans stack, left alignment, primary text colour. The panel contributes surface only, never typography.
3. When an artifact genuinely cannot be rendered, the panel shows a sentence a person can read plus a control that reveals the source. The source is not shown until the control is used.
4. Section 3 is that record.

**What "cannot be rendered" means** — three reachable cases: the kind is not in the registry (an old row); the preview failed validation on read and arrived as `null` (already handled by "No preview available", `ArtifactPreviewSurface.tsx:32-34`); or a `text` body derives to nothing.

---

## 3. The isolation decision (AC #4)

### 3.1 What an artifact is

An artifact of the `html` kind is a self-contained single-page document — its own styles, its own scripts, interactive. That is the whole point of the category. Sanitising it away is a product deletion, not a safety measure. The category's answer is not "make the content harmless"; it is **let the document run whole, inside a box it cannot reach out of.**

### 3.2 What the research established

*Primary sources first; every claim below is either from a written specification or something I measured. Blog restatements are marked as such and are not load-bearing.*

**The sandbox mechanism (MDN, `<iframe>`, read 2026-08-11).** Without `allow-same-origin`, "the resource is treated as being from a special origin that always fails the same-origin policy (potentially preventing access to data storage/cookies and some JavaScript APIs)." And the footgun, verbatim: when the embedded document has the same origin as the embedding page, "it is strongly discouraged to use both `allow-scripts` and `allow-same-origin`, as that lets the embedded document remove the `sandbox` attribute — making it no more secure than not using the `sandbox` attribute at all."

**A written contract that already solves our exact problem — MCP Apps.** The Model Context Protocol has a ratified extension for exactly this: a server ships an HTML document, a host renders it. Specification version 2026-01-26 (`modelcontextprotocol/ext-apps`, `specification/2026-01-26/apps.mdx`). Normative points:
- "All View content MUST be rendered in sandboxed iframes with restricted permissions."
- The host builds the CSP; **the default when the server declares nothing** is `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none'` — i.e. scripts and styles run inline, and there is no network at all.
- "Host MAY further restrict but MUST NOT allow undeclared domains."
- Frame-to-host talk is JSON-RPC 2.0 over `postMessage`; the host mediates every call.
- Height is negotiated: the host "MUST listen for `ui/notifications/size-changed` notifications from the View and update the iframe dimensions accordingly."

This is the same shape the founder described, written down by someone else, and it is shipping: modelcontextprotocol.io lists Claude, **Claude Desktop**, VS Code Copilot, Goose and Postman as hosts. The `@mcp-ui/client` renderer uses `sandbox="allow-scripts"` for raw HTML and only adds `allow-same-origin` for content loaded from an external URL — a different origin, where the escape footgun does not apply. *(That last detail is from mcp-ui's docs as surfaced in search, not a page I could open directly — treat as corroborating, not load-bearing. Our decision does not depend on it.)*

**The Electron question is answered by that same list.** Claude Desktop is an Electron app (widely reported, and consistent with its Chromium-based UI) and it is a listed MCP Apps host, so a sandboxed iframe running untrusted generated HTML inside an Electron renderer is shipped practice, not a research project. I did not stop at the existence proof — see 3.3.

**One forward constraint.** A `srcdoc` document inherits the embedding page's Content Security Policy (W3C CSP issue #700 and the surrounding webappsec discussion). HyperIdle has **no CSP anywhere today** (I grepped `applications/`, `layers/`, `framework/`, `tools/` — zero hits). So nothing is inherited now, but whoever adds an app-wide CSP later must exempt or account for the artifact frame or every artifact's inline script dies.

**Claude's own artifacts** are reported to run from a per-artifact origin under `claudeusercontent.com` with a sandboxed iframe and a restrictive CSP. That comes from security blogs, not an Anthropic primary document, so I treat it as a hint about direction, not evidence. It agrees with the MCP Apps spec.

### 3.3 What I measured, on this machine, today

I did not take the mechanism on trust. Two probes, both re-runnable: `probes/electron-frame-probe.cjs` and `probes/electron-exfil-probe.cjs`, run under **Electron 43.1.1 / Chromium 150.0.7871.114 — the exact Electron version `applications/desktop` pins** — reproducing the real `webPreferences` and serving the host page over `http://127.0.0.1:<port>`, the same shape the packaged app loads (`main.ts:564`). Raw results in `probes/electron-frame-probe-result.json` and `probes/electron-exfil-probe-result.json`.

| Frame configuration | script runs | its origin | parent DOM | cookies | localStorage | app's own API |
|---|---|---|---|---|---|---|
| `sandbox="allow-scripts"` | yes | `null` | SecurityError | SecurityError | SecurityError | blocked |
| `sandbox="allow-scripts allow-same-origin"` | yes | the app's origin | **readable** | readable | **works** | **succeeds** |
| no sandbox attribute | yes | the app's origin | **readable** | readable | **works** | **succeeds** |
| `sandbox="allow-scripts"` + in-document CSP | yes | `null` | SecurityError | SecurityError | SecurityError | blocked |

**The preload bridge does not reach iframes.** `window.__HYPERIDLE__` — which carries the API key and the credential IPC channel (`applications/desktop/src/preload.ts:13-30`) — was **absent in all four frames**, including the un-sandboxed same-origin one. So the desktop app's credentials are main-frame-only under the current settings. This is the specific Electron answer: nothing in `applications/desktop` makes this hard.

**Sandbox alone does NOT stop a hostile artifact calling home.** With no CSP, a sandboxed frame reached an outside server twice — once by `fetch`, once by an image beacon. Both requests arrived. With an in-document CSP (`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:`), **zero requests reached the outside server**, and the script still ran. The founder's third point is the load-bearing one, and it is now measured rather than assumed.

**The same held in a plain browser** (Chromium 149): opaque origin, no parent DOM, no cookies, no storage, no network under CSP — and a button inside the CSP'd frame was clicked and responded, proving interactivity survives the box. The web form factor is strictly less privileged than the desktop one (no preload, no IPC), so the desktop result is the binding case and the browser probe was pruned as redundant with it. What replaced it as the standing browser proof is `layers/core-ui/__e2e__/AZ6-artifact-frame.spec.ts`, which runs the same attacks against the shipped code.

### 3.4 What `applications/desktop` actually sets

Both windows (`main.ts:529-535` local mode, `634-641` shared mode) set: `contextIsolation: true`, `sandbox: true`, and a preload. Not set, therefore at their safe defaults: `nodeIntegration` (false), `nodeIntegrationInSubFrames` (false), `webviewTag` (false), `webSecurity` (on). Auth is a header key read from `window.__HYPERIDLE__.apiKey` in the app's JS context, not a cookie (`layers/core-ui/src/services/api-fetch.ts`). Every one of those is what we need. **Nothing holds this back.** The two settings that would break it are `nodeIntegrationInSubFrames: true` and adding `allow-same-origin` to the frame; neither exists, and the second is ours to never write.

### 3.5 The gap I am not designing around

We have **no separate origin to serve artifacts from.** In desktop local mode the app is served by the embedded server on one loopback port; in shared mode by the configured server. A second origin means a second listener, packaging and config plumbing, and a URL the desktop must trust — infrastructure that does not exist.

My read: we do not need it for this decision, because the opaque origin already gives us the isolation, and I measured that rather than assuming it. A separate origin becomes necessary the day an artifact needs `allow-same-origin` — i.e. the day artifacts want `localStorage`, ES modules, or declared network access. **That day is a work package of its own, not a line item here.** Recorded so the choice is visible, not buried.

### 3.6 The decision, per kind

| Kind | How it renders | Why |
|---|---|---|
| `text` | Inline, as blocks, in the shared primitives. **No frame.** | It is prose. A frame would break text selection, block anchoring and theme inheritance, and it buys nothing — prose has no execution surface once its embedded HTML is handled (next row). |
| raw HTML **inside** a `text` body | Sanitised with DOMPurify's default profile and rendered inline. **No frame, no scripts.** | An `<details>`, `<table>` or `<br>` inside a document is formatting, not an app. This is the same content the deriver already produces for Knowledge and comments, where DOMPurify is already the answer (`KnowledgeBody.tsx:54`). One policy for one class of content. An agent that wants an app declares the `html` kind. |
| `html` | Its **own document**, in a sealed frame. Scripts run. Styles apply. It is interactive. | This is the artifact category. See the rule below. |
| `code`, `image`, `data`, `url` | Unchanged inline primitives. | No execution surface. Image URLs are already scheme-checked (`ImagePayload.tsx:12-29`). |

### 3.7 The rule for the `html` kind, as code can enforce it

**Revised after review, 2026-08-12.** The single-frame rule below was escapable and the review proved it: an artifact could navigate its *own* frame to any host — `location.href`, or a `<meta http-equiv="refresh">` needing no script at all — carrying whatever it liked in the URL, and the panel then painted a live attacker page under a caption saying it had no network. No CSP directive governs a document navigating its own browsing context (`frame-src` governs *nested* contexts; `navigate-to` was never shipped) and no sandbox token withholds it. The rule is now:

An `html` artifact is rendered through **two** layers:

1. **The shell** — a document we compose, carrying the policy, holding nothing but the artifact's frame. The app renders it in an `<iframe sandbox="allow-scripts">` with no `src`.
2. **The artifact** — a nested `<iframe sandbox="allow-scripts" srcdoc="…">` inside the shell, carrying the policy again and the artifact's markup verbatim.

Nesting is the point: the artifact's frame is now a **nested** context, so its navigations are checked against its embedder's policy — and the embedder is ours. This is the shape the MCP Apps spec calls a *sandbox proxy*, minus the separate origin we do not have. Measured: single layer, the self-navigation reached a real listener; two layers, `ERR_BLOCKED_BY_CSP` and the listener recorded nothing.

The policy, on both layers:

`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; webrtc 'block'`

The artifact may run its own script and its own styles and load its own images, fonts and media as `data:` URIs. It may reach **no origin at all** — not a third party, and **not ours**.

**Corrected 2026-08-12.** An earlier version of this section said *"`'self'` matches nothing from an opaque origin"*. That sentence was false and the code that rested on it was wrong. Chromium resolves `'self'` in a `srcdoc` document to **the embedding app's origin**, and the policy carried `'self'` on five directives, so a hostile artifact had eight channels aimed straight at HyperIdle's own server with a path and query string of its choosing: `<img>`, dynamic `Image()`, CSS `url()`, `@font-face`, `<video>`, `<script src>`, `prefetch` and `preload`. Measured: with `'self'`, all eight reached; without it, none. Not a localhost curiosity either — in shared mode the desktop app loads a remote server (`applications/desktop/src/main.ts:667`), so the app's origin is a real network host.

The mistake underneath it is worth naming, because it is now the second time it has cost something: **this policy was copied from MCP Apps, whose threat model is not ours.** Their frames are served from a host-controlled *resource origin*, where `'self'` is a narrow and meaningful grant. Ours is a `srcdoc` document with an opaque origin, where the same token means the opposite of what it looks like. Borrowing a shape is fine; borrowing a token whose meaning depends on architecture is not.

Two directives are load-bearing beyond their obvious job:

- **`frame-src 'none'`** is what pins the artifact in place. Removing it does not relax a nicety, it re-opens the escape.
- **`webrtc 'block'`** is **not enforced** by the Chromium this app ships. Measured: with the directive set, an artifact's `RTCPeerConnection` still emitted UDP packets to a STUN host of its choosing, and `connect-src` does not cover WebRTC either. It stays in the policy for the day it is honoured. What closes that channel today is that the WebRTC constructors are **removed from the artifact's document** before its own script runs, non-writable and non-configurable, with no fresh realm to borrow them from — every frame the artifact can create is sandboxed into its own opaque origin.

**Enforcement is still an absent parameter.** `ArtifactFrame` takes `{ html, title }`. There is no prop for the sandbox tokens, the policy or the shell. One further thing is now security-critical: the artifact lives inside the shell's `srcdoc` **attribute**, so the escaping that puts it there is what keeps it out of the shell — `&` first, then `"`, with a test that tries to break out.

### 3.8 What this actually is, stated plainly

*Rewritten 2026-08-12, final. It records what was learned, not a clean story.*

**This is an MVP with an enumerated set of closed channels. It is not a proof that nothing escapes.** Nothing escapes is not a thing anyone can prove about a browser. What we have is a list of channels we tried, each one closed and each one shown red by removing its mitigation. A third round would probably find a channel this list does not name; that is the honest expectation, not a worry.

**What is closed** — every channel the e2e spec asserts by name (`fetch`, `XMLHttpRequest`, WebSocket, `EventSource`, `sendBeacon`, `<img>`, dynamic `Image()`, CSS `url()`, `@font-face`, `<video>`, `<script src>`, `prefetch`, `preload`, nested iframe, self navigation, `meta refresh`, form submission, `target="_blank"`, `window.open`, top navigation, parent navigation, and WebRTC by both a direct constructor and one borrowed from a nested realm), against a third-party listener **and** against the app's own origin. Plus, closed by the opaque origin and re-measured: the app's DOM, the API key, cookies, `localStorage`, IndexedDB, service workers, the clipboard, geolocation, `getUserMedia`, and Electron's preload bridge, which does not reach subframes at all.

**What remains possible inside the box.** The artifact can spin the CPU, allocate memory, and paint anything it likes inside its own rectangle — including something that resembles HyperIdle's own interface. It can refuse to render at all. There is no watchdog on a runaway script, and nothing detects an artifact that merely *looks* like the app; its own border and caption are the only tell. `Notification.permission` reads `granted` in the desktop build, so an artifact may be able to raise an OS notification — noise, not egress, and not closed.

**`PARENT-NAV` is platform-guaranteed, not our proof.** A sandboxed context cannot navigate an ancestor, and no configuration of our own code makes that assertion fire. It is green because the platform says so. Read it as a note, not as evidence we produced.

**When we revisit this.** The trigger is an artifact wanting storage, ES modules, or real declared network access. Any of those needs `allow-same-origin`, which needs the separate serving origin §3.5 records us not having. That same origin is also the door to being a real MCP Apps host — a controlled resource origin plus the JSON-RPC bridge §8.4 declined. Both live in a work package of their own, not this one.

**The transferable root cause.** We adopted MCP Apps' isolation shape but skipped its controlled serving origin, and then kept policy lines whose safety depended on the piece we skipped. `'self'` is a narrow, meaningful grant on a host-controlled resource origin; on a `srcdoc` document it resolves to the embedding app's origin and means close to the opposite. The lesson is not the word `'self'` — it is that a config borrowed from a spec has to be re-read against your own architecture, line by line, before it is trusted.

**The caption says what the frame is, not what it cannot do.** It reads *"Runs on its own, in a box sealed off from the app."* That sentence stays true without anyone having to enumerate every channel in the web platform, which is why it replaced an absolute promise. Founder's ruling, 2026-08-12: nothing escapes is impossible in IT, and we are building an MVP.

---

## 4. User-facing shape

Everything named is an existing design-system export unless marked new.

**Prose (`text`).** The panel keeps its surface — `--surface-container`, `--r-subtle`, 12px padding — and loses every typographic class. Content fills the panel from the left in the product's normal reading typography, using the same `Block` primitives as Knowledge, so an artifact and a knowledge item read the same. The gallery one-line summary keeps its small monospace caption treatment, as a class on that caption, not on the panel.

**Interactive (`html`).** A new `ArtifactFrame` — new because no existing export renders a sealed document; it composes rather than duplicates.

- Full panel width, no inner padding fighting the document's own layout.
- Starts at a readable default height and grows to the height the document reports, capped at a fraction of the viewport. Height comes from a small reporter script we add to the srcdoc, which posts its `scrollHeight` to the parent — the same idea as the MCP Apps `size-changed` notification, without adopting the whole JSON-RPC dialect for one number. **Honest caveat:** that script shares a document with untrusted code, so a hostile artifact can lie about its height. Hence the cap.
- An **Open larger** control puts the same frame inside the existing `Dialog` at its largest size. Nothing else changes — same sandbox, same policy. **As built, one honest limit:** `Dialog`'s largest size caps at 720px wide. On a 1280px window that is bigger than the panel; on a very wide window it is not. Widening `Dialog` is a change to a shared component every overlay uses, so it is not taken here — see §9.
- One quiet line beneath the frame. **As shipped:** *Runs on its own, in a box sealed off from the app.* Plain words, not a badge. It says what the frame is rather than enumerating what it cannot do — see §3.8.

**Unrenderable.** `EmptyState` with `compact`, its `action` slot holding a `Button`:

> **This artifact can't be shown here**
> It was saved as a "spreadsheet", which HyperIdle doesn't know how to display yet.
> [ View source ]

*View source* reveals `CodePayload` beneath it with the raw text or JSON — monospace in the one place where monospace is honest. Composed inline in `ArtifactPreviewSurface.tsx`, with a story variant.

**No fork worth your judgement.** The shape follows from the isolation decision and the existing exports.

---

## 5. Technical plan

**Contracts.**

- `ArtifactPreviewSurfaceProps` becomes a union: `{ kind, preview, size?: "gallery" }` or `{ kind, preview, size: "full", sanitizeHtml }`. A full-size preview cannot be constructed without a sanitiser for the prose path — a type error, not a silent downgrade. `ArtifactPreviewProps` gains the same required prop.
- `ArtifactFrame` takes `{ html: string }`. No sandbox prop. No policy prop. No bridge.
- The design-system package still never imports DOMPurify; the app injects it, as the existing lore requires.

**Ordered tasks.**

1. `layers/core-ui/src/utils/sanitize-html.ts` (new) — one exported `sanitizeHtml`, DOMPurify default profile. `KnowledgeBody.tsx` drops its local copy and imports it. One policy for prose HTML across both hosts.
2. `framework/design-system/src/artifact-frame/build-srcdoc.ts` (new) — pure function: artifact HTML in, full document out (CSP meta + height reporter + body). The single home of the policy string and the sandbox string.
3. `framework/design-system/src/ArtifactFrame.tsx` (new) + `.stories.tsx` — the iframe, the fixed sandbox string, height message handling with a cap, and the *Open larger* control wired to `Dialog`.
4. `framework/design-system/src/kinds/artifact-unrenderable.tsx` (new, not exported from the barrel) — the designed unrenderable state. It lives in its own module rather than inside `ArtifactPreviewSurface.tsx` as §4 first said, because `composeArtifactBody` needs it too and the surface already imports that function; either other home is an import cycle. Same composition, different file.
5. `framework/design-system/src/ArtifactPreviewSurface.tsx` — split `SURFACE_BASE` into chrome and a separate caption class used by the no-preview text and the gallery summary. Full size becomes a left-aligned, full-width content host. Route `html` to `ArtifactFrame`. Add the unrenderable state and use it for the unknown-kind and malformed paths.
5. `framework/design-system/src/kinds/compose-artifact-body.tsx` — pass the sanitiser through the `text` case; the `html` case now returns the frame; the artifact-level fallbacks (lines 79-81, 118, 187) return the unrenderable state instead of `UnknownPayload`.
6. `framework/design-system/src/ArtifactPreview.tsx` — accept and forward `sanitizeHtml`.
7. `framework/design-system/src/block/UnknownPayload.tsx` — map `reason` to a sentence instead of printing the enum. (See question 1 — this component also appears in knowledge items and comments.)
8. Call sites pass the sanitiser: `ArtifactPermalink.tsx:37`, `ArtifactSection.tsx:212`, `pages/_dev/ArtifactDemo.tsx:86`.

**How the unsupported case is detected.** `isRegisteredKind(kind)` from the domain model — the function the API already uses — plus the existing null-preview check. No new classification logic.

**Deliberately not touched.** How artifacts are produced or stored; a separate serving origin; an app-wide CSP; any artifact-to-app message bridge; page anatomy and breadcrumb (AZ11); artifact lists (AZ9); editing.

---

## 6. Evidence plan

| AC | Method | Where |
|---|---|---|
| 1 — prose renders as content | Component test | `framework/design-system/src/__tests__/AZ6-artifact-renders-content.test.tsx` — a `text` artifact with heading, list, table and a raw-HTML block: assert `h1`, `ul`, `table` exist and zero `[data-block-unknown-pill]`. |
| 1 — an `html` artifact actually runs | Painted + behavioural proof in a real browser | `layers/core-ui/__e2e__/AZ6-artifact-frame.spec.ts` — an `html` artifact whose script writes text and whose button changes on click. Assert the script-written text appears **inside the frame**, click the button, assert it changed. If scripts were stripped this test is red. |
| 1 — the frame is sealed | Behavioural proof, same spec | A deliberately hostile test artifact that tries to (a) read `parent.document.title`, (b) read `document.cookie`, (c) write `localStorage`, (d) `fetch` HyperIdle's own `/api/artifacts`, (e) `fetch` an outside URL, (f) load an outside image. It renders the outcome of each attempt into its own body. Assert every one reports blocked, and assert the test's own outside listener recorded **zero** requests. That last part is the exfiltration proof — the same shape as `probes/electron-exfil-probe.cjs`, which already shows it failing without the policy. |
| 2 — chrome does not restyle content | Component test **and** painted proof | Test: the content-host element carries none of `uppercase`, `font-mono`, `justify-center`, `tracking-*`, `text-[var(--text-tertiary)]`. Painted: `getComputedStyle` on the rendered `<h1>` — `textTransform === "none"`, sans stack — and the visible text still reads `Q3 pricing decision`, not `Q3 PRICING DECISION`. Inheritance only exists in a browser, so this half cannot be a unit test. |
| 3 — designed unrenderable state | Component test | `AZ6-unrenderable-artifact.test.tsx` — explanation shown, source hidden until the control is pressed. |
| 4 — decision recorded | This section 3, approved before code. Then held by the code: `ArtifactFrame` exposes no sandbox or policy prop, and a test asserts the rendered iframe's `sandbox` attribute is exactly `allow-scripts` and that its `srcdoc` begins with the policy `<meta>`. |

**A note on where these run.** The e2e lane is local-only in this repo, so the frame proofs run on a developer machine, not per-merge CI. The component tests and the `sandbox`/`srcdoc` assertion do run in CI, and they are the ones that catch a loosened sandbox. Stating it rather than implying the browser proof is a gate.

**End-to-end proof.** The same two permalinks are re-opened against the fixed build and the after-screenshots go beside the before-screenshots in `probes/after/`. The `text` artifact must paint as a normal document; the `html` artifact must paint as its own live page. I read the PNGs back before calling it done. Plus `npm run check`, `npm run lint`, `npm run test`. (The one-off scripts that drove those screenshots were pruned on review — the durable proof is the e2e specs, which run against the shipped code rather than a bespoke harness.)

---

## 7. Scope — what AZ6 should and should not carry

**My recommendation: keep it together.** The interactive path is one new component, one pure srcdoc builder, and the tests above — it shares the dispatch and the panel with the prose fix, and splitting it leaves the `html` kind painting its own source, which is the same defect under a different name.

**AZ6 delivers:** the panel-typography fix; prose renders as content; the `html` kind runs as a sealed interactive document; the designed unrenderable state; the evidence above.

**AZ6 does not carry, and each needs its own decision:** serving artifacts from a separate origin; an application-wide CSP; any message bridge between an artifact and the app (tool calls, data push — the MCP Apps direction); per-artifact declared network allowlists; storage for artifacts; editing.

**If you want it smaller,** the honest cut is: AZ6 ships everything above but with a fixed-height frame and the *Open larger* control, and the height-reporting message moves to the follow-up. That removes the only part of the frame work that involves a channel between the document and the app. It is a small saving, and I would not take it unless you want the frame decision itself deferred.

---

## 8. Open questions — and the founder's answers

Answered 2026-08-11, on approval of revision 2. Recorded here so the record is closed.

1. **Scope.** Keep the interactive `html` path inside AZ6, or split it out? → **Keep it in AZ6.**
2. **`UnknownPayload` wording.** Fixing the machine string also changes what knowledge items and comments say. → **Take it everywhere.** Words only, no layout change.
3. **Missing list bullets.** `ListPayload` is shared by every host. → **Fix it here.** Without it the "renders as content" screenshot shows a document with no bullets, which would make the proof dishonest.

Two further decisions taken at the same time:

4. **Isolation without the bridge.** Adopt the MCP Apps isolation recipe; do **not** implement its JSON-RPC-over-postMessage tool-calling bridge — an artifact has nobody to talk to, and the bridge is the one hole in the box. Shape what is built so a future host capability is a superset rather than a rewrite.
5. **No separate origin.** Domains were offered and declined: the opaque origin is what does the isolating, and it is measured. §3.5 stays as the recorded trigger for revisiting. On the desktop a domain would not be the mechanism anyway — the app is served from a loopback port, and a second port is already a distinct origin.

---

## 9. Built — what happened, and two things worth your attention

Built 2026-08-11, tests first. All ACs met; `npm run check`, `npm run lint` and `npm run test` are clean.

**The seal was proven by breaking it, twice.** With the sandbox as shipped, the hostile test artifact reports BLOCKED on all seven attempts and the outside listener records nothing. Granting `allow-same-origin` flipped `parent-dom` to `REACHED HyperIdle` and the test went red. Removing the policy `<meta>` flipped `outside-fetch` to `REACHED` and the test went red again. Both were reverted and re-proved green.

**Two findings this work uncovered. Neither is fixed here — both are bigger than AZ6.**

1. **The design system is invisible to Tailwind.** `layers/core-ui/src/index.css:78` declares `@source "../../design-system/src/**/*.{ts,tsx}"`, which resolves to `layers/design-system/` — a directory that does not exist. The design system is under `framework/`. So **no utility class used only inside the design-system package has ever been generated**; DS components work only where the same class also appears somewhere under `layers/core-ui/src/`. I hit this head-on: the one-class bullet fix sat correctly on the element, passed a class-name assertion, and painted `list-style-type: none`. The bullets ship as an inline style with a `@lore` explaining why, so they actually appear. **Fixing the glob is a one-character-class change with an unknown visual blast radius** — every silently-dropped DS utility would start applying at once. That deserves its own pass with screenshots, not a quiet edit inside this one.

2. **A class-name assertion is not a visual test.** The bullet fix was green in vitest while broken on screen. The assertion now checks the property the element actually carries, and the real proof is a computed `list-style-type` in a browser. Worth remembering the next time a UI acceptance criterion looks like it can be checked in jsdom.

Also worth a mention, smaller: `Dialog`'s largest size is 720px, so *Open larger* is larger on a normal window and not on a very wide one. Widening `Dialog` touches every overlay in the app.

**Corrections to my own plan, made during the build:** the height reporter must measure `<body>`, not `<html>` — the root element fills the frame's viewport, so a short artifact reported its own current height back and never shrank. And the unrenderable state lives in its own module to avoid an import cycle. Both are recorded as `@lore` where they matter.

---

## 10. Review round — what was wrong, and what closed it

Independent review returned **NOT-DONE** with four blocking findings. All four are fixed; each fix has a run that shows the new guard failing.

| Finding | What was wrong | What closed it | Shown red by |
|---|---|---|---|
| Self-navigation | `location.href` and `meta refresh` carried a request out and painted an attacker page inside the panel | The two-layer shell — the artifact is now a nested context under `frame-src 'none'` (§3.7) | Relaxing `frame-src` to `*`: `channel META-REFRESH reached the outside listener`, plus `SELF-NAV`, `NESTED-IFRAME`, `PREFETCH` |
| WebRTC | `connect-src 'none'` does not cover it, and `webrtc 'block'` is not enforced in our Chromium — four UDP packets left the frame | The constructors are removed from the artifact's document before its script runs, non-writable, with no realm to borrow from | Emptying that list: `WebRTC left the frame as UDP` |
| The seal spec was blind | Seven attempts, cited as proof of a sealed frame, while two channels stood open | Seventeen channels, each asserted **by name**, plus a UDP listener — and the navigating ones split into their own artifact because a blocked navigation still tears the document down | Each break above names its channel |
| The unrenderable state lied | A `text`, `image` or `code` artifact was told the product cannot display its kind | `isRegisteredKind` now separates *unknown kind* from *empty* from *malformed*, with a sentence each, and no source control when there is nothing to reveal | The tests now cover all three; the old copy fails every one |

**A trap inside my own fix.** The listener recorded `/META-REFRESH` while the assertions compared against `META-REFRESH`, so every per-channel check was unfalsifiable — thorough-looking and incapable of failing. It was caught by running the break rather than trusting the green, and the recording is normalised now. Same lesson as the earlier bullet-class assertion: a check that has never been shown to fail has not been shown to work.

**Non-blocking, fixed:** the height reporter is emitted before the artifact's markup, so an unclosed `<script>` cannot swallow it; an empty `html` artifact says it is empty instead of painting an empty frame; the computed **colour** clause of AC #2 now has a browser assertion; the two states this work package creates have stories.

**Non-blocking, left undone, deliberately:** a small image still sits in a full-width bordered box (`ImagePayload`'s figure stretching inside the approved full-width content host — a shared payload's layout, not this surface's). And `Dialog` still caps at 720px, so *Open larger* is larger on a normal window and not on a very wide one.

**On the process trap the reviewer hit:** `playwright.config.ts` reuses an existing server on 5179, and a sibling worktree's stale server will silently answer. I killed the listeners on 5179 before every e2e run in this round and confirmed the port was free first.

---

## 11. Second review round — same-origin egress

Review two returned **NOT-DONE** with two blocking findings. The two-layer shell, the attribute escaping (14 breakout payloads), the WebRTC neutraliser and the unrenderable state all held under direct attack. These did not.

| Finding | What was wrong | What closed it | Shown red by |
|---|---|---|---|
| `'self'` is not `'none'` | Copied from MCP Apps, where frames have a real resource origin. In a `srcdoc` document Chromium resolves `'self'` to **the app's origin**, opening eight channels at HyperIdle itself | Every `'self'` removed. The artifact reaches no origin — inline script and style, `data:` for its own assets, nothing else | Six one-directive breaks, each naming its channels: `img-src 'self'` → `IMG, IMG-DYNAMIC, CSS-URL, PRELOAD, PREFETCH`; `font-src 'self'` → `FONT`; `media-src 'self'` → `MEDIA`; `script-src 'self'` → `SCRIPT-SRC`; `connect-src 'self'` → `FETCH, XHR, SENDBEACON, EVENTSOURCE`; `default-src 'self'` → `PREFETCH` |
| The spec was blind to it | Its only listener was a third-party origin, so a request to our own host was unobservable and the `APP-API` assertion had never been capable of failing | A same-origin observer: twelve channels, each asserted by name | The six breaks above — every one of them was green before this observer existed |

**The observer needed care of its own.** `page.on("request")` fires for CSP-*blocked* requests too, so it reports attempts rather than egress — an observer that cannot tell "blocked" from "sent" is not one. Route interception sits downstream of the policy check, so a handler that runs means the request genuinely left. That is what the spec uses, and the six breaks are what prove it can see.

**Re-broke three guards this round did not touch,** to check they still fail loudly rather than having rotted: sandbox → `allow-same-origin` (red: parent DOM reached, and WebRTC now leaves too, since the frame gains a real origin); `frame-src` relaxed (red: self-navigation and prefetch reach both listeners); srcdoc quote-escaping removed (red: five tests, including the breakout case).

**What else was inherited from MCP Apps, and why it is fine.** Their spec carries a `permissions` field for camera, microphone, geolocation and clipboard, delegated through an iframe `allow` attribute. We delegate nothing. Measured inside the sealed frame: `getUserMedia` → `SecurityError`, geolocation → denied, clipboard → `NotAllowedError`, IndexedDB and service workers → `SecurityError`. Adding an empty `allow=""` changed none of them, so it was not added. Their `base-uri` default is `'self'`; ours is `'none'`, which is stricter. Their sandbox proxy uses `allow-same-origin` on the outer frame because it sits on a separate origin — we do not have one, so we do not use that token anywhere. The one thing left open is `Notification.permission`, which reads `granted` in the desktop build; it is noise rather than egress and is recorded in §3.8 rather than fixed.

**Two rounds, two channels nobody had thought to try.** Both times the tests were green and thorough-looking. The pattern worth carrying forward is not "add more channels" but "an assertion nobody has watched fail is not evidence" — the same shape as the `/META-REFRESH` vs `META-REFRESH` bug and the `list-disc` class that never applied.

---

## 12. Simplification pass — three cuts before the PR

The founder flagged the diff size. An independent simplification review found the work not over-engineered with one exception, and defended the two-layer shell, the egress matrix, the srcdoc escaper, the height reporter and the WebRTC neutraliser on measured evidence. Three things were cut.

1. **The escape backstop is gone.** `ArtifactFrame` counted `load` events on the shell iframe and painted a "tried to leave its box" panel on the second one. It guarded a case nothing in an artifact can reach, and its own neighbour disproved it: the *Open larger* dialog renders the identical `srcDoc` in a second iframe with no counter at all, so if a replaced shell were a real threat the largest view of the artifact would have been the unguarded one. Either it matters everywhere or it matters nowhere. `frame-src 'none'` is what actually holds, and that is measured (`probes/egress-matrix-result.json`, row C: loosening only the inner policy changes nothing). The state, its UI and its three tests were removed; the lore explaining why no backstop is needed stays in `ArtifactFrame.tsx`, which is worth more than the backstop was.
2. **`probes/` pruned.** Kept: the two Electron probes plus their preload and results (nothing else proves the desktop claim, and two are cited by name from lore in `build-srcdoc.ts`), `egress-matrix-probe.cjs` and `same-origin-probe.cjs` with their results, and the before/after screenshot pair for `az6-text` and `az6-html` — the outcome proof. Deleted: seven one-off scripts and seven screenshots that said nothing the survivors do not.
3. **Three assertions on the spelling of a string, deleted.** `toContain("configurable:false")` (the real proof is `udpPackets: 0` in e2e), `toContain("e.source!==f.contentWindow")` (the behavioural proof is the sibling test that ignores a height message from another window), and an assertion that `ARTIFACT_SIZE_CHANGED_METHOD` equals its own definition. The `describe("the policy")` block above them was deliberately left alone: it looks like the same shape but is not, because the e2e lane is local-only, so those constant assertions are the only CI-visible guard against a host or `'self'` going back into the policy — the exact regression that shipped once already.

---

## Sources

Read 2026-08-11. Every measurement below the line is mine and re-runnable from `probes/`.

- [MDN — `<iframe>`, sandbox attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) — opaque origin without `allow-same-origin`; the `allow-scripts` + `allow-same-origin` escape.
- [MCP Apps specification, version 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) — sandboxed-iframe MUST, default CSP, postMessage JSON-RPC channel, `size-changed` sizing.
- [MCP Apps overview, modelcontextprotocol.io](https://modelcontextprotocol.io/extensions/apps/overview) — host list including Claude Desktop; security model.
- [MCP Apps announcement, 2026-01-26](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) — context for the extension.
- [MCP-UI `HTMLResourceRenderer` docs](https://mcpui.dev/guide/client/html-resource) — `allow-scripts` for raw HTML, `allow-scripts allow-same-origin` only for external URLs. *Corroborating; I could not open the page directly, so this rests on search summaries.*
- [W3C CSP issue #700 — srcdoc inherits the embedder's policy](https://github.com/w3c/webappsec-csp/issues/700) — the forward constraint on adding an app-wide CSP.
- [Claude Desktop is an Electron app](https://www.dbreunig.com/2026/02/21/why-is-claude-an-electron-app.html) — commentary, not a vendor statement; used only as an existence proof, and superseded by my own Electron measurement.
- Reported, not primary, and not load-bearing: Claude artifacts are described as running from a per-artifact `claudeusercontent.com` origin under a sandboxed iframe and a restrictive CSP ([bloom.security](https://bloom.security/blog/claude-artifacts), [pluto.security](https://pluto.security/blog/inside-claude-artifacts-how-your-agent-publishes-to-the-web/)).
- Measured here, 2026-08-11/12, and kept: `probes/electron-frame-probe.cjs` and `probes/electron-exfil-probe.cjs` (Electron 43.1.1 / Chromium 150.0.7871.114, the version `applications/desktop` pins), `probes/egress-matrix-probe.cjs` and `probes/same-origin-probe.cjs`. Results in the matching `*-result.json` files. The remaining probes were pruned on review as one-offs superseded by the e2e specs.
