/**
 * The document an artifact of the `html` kind runs inside, and the things that
 * seal it.
 *
 * An artifact is a self-contained page — its own styles, its own scripts,
 * interactive. It is also written by an agent, so it is untrusted input. The
 * category's answer is not to strip what makes it valuable but to let it run
 * whole inside a box it cannot reach out of. This module is that box, and it is
 * the ONLY place the sandbox string, the policy and the shell are written.
 *
 * ## Two layers, and why
 *
 * @lore AZ6: the artifact does NOT sit directly in the frame the app renders. It
 * sits in a nested frame inside a shell document we compose, and the shell's
 * policy carries `frame-src 'none'`. That is not decoration — it is the only
 * thing that stops a hostile artifact navigating ITSELF out of the box.
 *
 * A single-layer frame is escapable and we measured it: `location.href = "http://…"`
 * (and `<meta http-equiv="refresh">`, which needs no script at all) navigates the
 * artifact's own frame to a host the author chose. The request goes out, and the
 * panel then paints a live attacker-controlled page inside the app's chrome. No
 * CSP directive governs a document navigating its own browsing context —
 * `frame-src` governs NESTED contexts and `navigate-to` was never shipped — and no
 * sandbox token withholds it either (`allow-top-navigation` governs the top frame).
 *
 * Nesting turns the unreachable case into the reachable one: the artifact's frame
 * IS a nested context, so its navigations are checked against its embedder's
 * policy, and the embedder is a shell we control. Measured in the exact Electron
 * the desktop app pins: single layer, the self-navigation reached a real listener;
 * two layers, `ERR_BLOCKED_BY_CSP` and the listener recorded nothing. This is the
 * shape the MCP Apps spec calls a "sandbox proxy", minus the separate origin we do
 * not have. See `.pipeline/work/AZ6/probes/egress-matrix-result.json`.
 *
 * @lore AZ6: because the artifact now lives inside an ATTRIBUTE (the shell's
 * `srcdoc`), the escaping in `escapeSrcdocAttribute` is load-bearing in a way it
 * was not before. Breaking out of that attribute would land the artifact in the
 * shell document, where nothing stops it navigating away. Escape `&` first, then
 * `"` — the two characters that can end a double-quoted attribute value.
 *
 * ## The rest of the seal
 *
 * @lore AZ6: `allow-scripts` WITHOUT `allow-same-origin`, and never the two
 * together. With both, a frame whose document is same-origin with the embedder can
 * reach `window.parent`, read the app's DOM, and even remove the `sandbox`
 * attribute from its own iframe element — "no more secure than not using the
 * sandbox attribute at all" (MDN, `<iframe>`). Measured: with the pair granted the
 * frame read the parent DOM, wrote localStorage and called HyperIdle's own API;
 * with `allow-scripts` alone every one of those failed.
 *
 * @lore AZ6: the sandbox alone does NOT stop a hostile artifact calling home. A
 * sandboxed frame with no policy reached an outside listener by `fetch` and by an
 * image beacon. The policy is what closes those. Weakening `connect-src` or adding
 * a host to `img-src` re-opens exfiltration.
 *
 * @lore AZ6: `ArtifactFrame` takes the artifact's HTML and nothing else. There is
 * deliberately no prop for the sandbox tokens, the policy or the shell — a call
 * site cannot loosen any of them, because there is no parameter to loosen. That
 * absence is the enforcement mechanism.
 *
 * @lore AZ6: a `srcdoc` document INHERITS the embedding page's Content Security
 * Policy (w3c/webappsec-csp#700). HyperIdle ships no app-wide CSP today, so nothing
 * is inherited. Whoever adds one must account for this frame — a page policy
 * without `'unsafe-inline'` in `script-src` will silently kill every artifact's
 * script, and the symptom will look like "artifacts stopped working", not like a
 * CSP change.
 *
 * @lore AZ6: this takes the isolation half of the MCP Apps recipe (specification
 * 2026-01-26, `modelcontextprotocol/ext-apps`) and deliberately NOT its
 * JSON-RPC-over-postMessage bridge — founder decision. An artifact here is a
 * finished document with nobody to talk to; the bridge (`tools/call`,
 * `resources/read`, `ui/open-link`) is the one hole in an otherwise sealed box.
 * What IS borrowed is the shape, so a future MCP Apps host capability is a superset
 * rather than a rewrite: the policy follows the spec's default-CSP shape, the
 * nesting follows its sandbox-proxy shape, and the height report uses the spec's own
 * `ui/notifications/size-changed` notification. A host that later wants the full
 * protocol adds a message handler and a permission model on top of this.
 */

/**
 * The sandbox tokens for an artifact frame — used for BOTH layers. Scripts, and
 * only scripts. Not `allow-same-origin` (see the lore above), and not
 * `allow-popups`, `allow-modals`, `allow-forms`, `allow-downloads` or
 * `allow-top-navigation`.
 */
export const ARTIFACT_FRAME_SANDBOX = "allow-scripts";

/**
 * The policy both layers carry. Shaped after the MCP Apps default for a UI
 * resource whose server declared no domains, which is exactly our case: a single
 * self-contained file with no network of its own.
 *
 * The artifact may run its own script and its own styles, and load its own images,
 * fonts and media as `data:` URIs. It may reach NO origin — not a third party, and
 * not ours.
 *
 * @lore AZ6: there is deliberately no `'self'` in this list, and putting one back
 * re-opens a hole. The MCP Apps default policy uses `'self'` because in THEIR
 * architecture the frame is served from a host-controlled resource origin, where
 * `'self'` is a narrow, meaningful grant. Here the artifact is a `srcdoc` document
 * with an opaque origin, and Chromium resolves `'self'` to THE EMBEDDING APP'S
 * ORIGIN — so `'self'` was granting a hostile artifact eight channels straight at
 * HyperIdle's own server, path and query string of its choosing. Measured: with
 * `'self'`, `img`, dynamic `Image()`, CSS `url()`, `@font-face`, `<video>`,
 * `<script src>`, `prefetch` and `preload` all reached the app; without it, none
 * did. It is not a localhost curiosity either — in shared mode the desktop app
 * loads a remote server (`applications/desktop/src/main.ts:667`), so the app's
 * origin is a real network host. See `probes/same-origin-result.json`.
 *
 * @lore AZ6: `frame-src 'none'` does double duty. It stops the artifact embedding
 * a remote page, and — because the artifact itself is a nested context inside the
 * shell — it is what stops the artifact navigating itself away. Removing it does
 * not merely relax a nicety; it re-opens the escape.
 *
 * @lore AZ6: `webrtc 'block'` is in the list for the day it is enforced. It is NOT
 * enforced in the Chromium this app ships (measured, Chromium 150: with the
 * directive set, an artifact's `RTCPeerConnection` still emitted UDP packets to a
 * chosen STUN host). `connect-src` does not cover WebRTC either. What actually
 * closes that channel today is `RTC_NEUTRALISER` below. Do not delete the
 * neutraliser on the strength of this directive being present.
 */
export const ARTIFACT_FRAME_CSP = [
	"default-src 'none'",
	"script-src 'unsafe-inline'",
	"style-src 'unsafe-inline'",
	"img-src data:",
	"media-src data:",
	"font-src data:",
	"connect-src 'none'",
	"object-src 'none'",
	"frame-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
	"webrtc 'block'",
].join("; ");

/** The MCP Apps notification an artifact frame uses to report its own height. */
export const ARTIFACT_SIZE_CHANGED_METHOD = "ui/notifications/size-changed";

/** Height an artifact frame opens at before it has reported anything. */
export const FRAME_INITIAL_HEIGHT = 420;

/** Floor for a reported height — below this a frame reads as broken, not compact. */
export const FRAME_MIN_HEIGHT = 180;

/**
 * Ceiling for a reported height.
 *
 * @lore AZ6: the reporter script shares a document with untrusted code, so an
 * artifact can lie about how tall it is. The cap is why that lie is boring.
 */
export const FRAME_MAX_HEIGHT = 1200;

/** Bring a reported height into the range the panel is willing to give it. */
export function clampFrameHeight(height: number): number {
	if (!Number.isFinite(height)) return FRAME_MIN_HEIGHT;
	if (height < FRAME_MIN_HEIGHT) return FRAME_MIN_HEIGHT;
	if (height > FRAME_MAX_HEIGHT) return FRAME_MAX_HEIGHT;
	return Math.round(height);
}

/**
 * Escape a document so it can live inside a double-quoted `srcdoc` attribute.
 *
 * Security-critical: breaking out of this attribute lands the artifact in the
 * shell document, which is not itself frame-src-protected. `&` must be replaced
 * before `"`, or the escape sequences would be double-escaped into re-openable
 * text.
 */
export function escapeSrcdocAttribute(document: string): string {
	return document.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

/**
 * Removes the WebRTC constructors before the artifact's own script runs.
 *
 * @lore AZ6: `connect-src 'none'` does not cover WebRTC and Chromium 150 ignores
 * the `webrtc` directive, so an artifact could open a UDP channel to any host it
 * named as a STUN server — measured, four packets to a bound listener. The
 * properties are redefined non-writable and non-configurable so the artifact
 * cannot put them back, and it cannot borrow a fresh pair from a nested frame
 * either: every frame it can create is sandboxed into its own opaque origin, so
 * reaching into that realm is a cross-origin access. Measured: with this in place,
 * both the direct attempt and the nested-realm attempt produced zero packets.
 */
const RTC_NEUTRALISER = `<script>(function(){
var names=["RTCPeerConnection","webkitRTCPeerConnection","mozRTCPeerConnection","RTCDataChannel","RTCSessionDescription","RTCIceCandidate"];
for(var i=0;i<names.length;i++){
try{Object.defineProperty(window,names[i],{value:undefined,configurable:false,writable:false});}
catch(e){try{delete window[names[i]];}catch(e2){}}
}
})();</script>`;

/**
 * The height reporter added to every artifact document.
 *
 * Kept to one number over one message. It is not a bridge and must not grow into
 * one: everything else an artifact might want to say belongs to a future host
 * capability with a permission model behind it, not to this script.
 *
 * @lore AZ6: measured off `<body>`, never off `<html>`. The root element fills the
 * frame's viewport, so `documentElement.scrollHeight` reports the frame's CURRENT
 * height back to the frame — a short artifact then keeps whatever height it opened
 * at forever. Body is auto-height and hugs its content.
 *
 * @lore AZ6: emitted BEFORE the artifact's markup, not after. An artifact ending in
 * an unclosed `<script>` or `<!--` swallows everything that follows it, which used
 * to eat the reporter and pin the frame at its opening height.
 */
const SIZE_REPORTER = `<script>(function(){
var post=function(){
try{
var b=document.body;if(!b)return;
var cs=getComputedStyle(b);
var h=b.getBoundingClientRect().height+parseFloat(cs.marginTop||0)+parseFloat(cs.marginBottom||0);
h=Math.max(h,b.scrollHeight);
parent.postMessage({jsonrpc:"2.0",method:${JSON.stringify(ARTIFACT_SIZE_CHANGED_METHOD)},params:{width:Math.ceil(b.scrollWidth),height:Math.ceil(h)}},"*");
}catch(e){}
};
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",post);}else{post();}
window.addEventListener("load",post);
if(typeof ResizeObserver!=="undefined"){var s=function(){if(document.body){new ResizeObserver(post).observe(document.body);}};
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",s);}else{s();}}
})();</script>`;

/**
 * Relays the inner frame's height notification up to the app.
 *
 * The shell is ours, so this is the only script in it. It forwards nothing but a
 * size-changed notification that came from its own child.
 */
const SIZE_RELAY = `<script>(function(){
window.addEventListener("message",function(e){
var f=document.getElementById("artifact");
if(!f||e.source!==f.contentWindow)return;
var d=e.data;
if(!d||d.method!==${JSON.stringify(ARTIFACT_SIZE_CHANGED_METHOD)})return;
try{parent.postMessage(d,"*");}catch(err){}
});
})();</script>`;

const HEAD = (csp: string, style = ""): string =>
	`<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, initial-scale=1">${style}</head>`;

/** The shell is pure scaffolding: it must fill the frame and show nothing of itself. */
const SHELL_STYLE = "<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}</style>";

/**
 * The document the artifact itself runs in — the inner layer.
 *
 * The artifact's markup is passed through verbatim: nothing is sanitised, stripped
 * or rewritten. That is the point. Exported for the tests that assert the seal.
 */
export function buildArtifactDocument(html: string): string {
	return [
		"<!doctype html><html>",
		HEAD(ARTIFACT_FRAME_CSP),
		"<body>",
		RTC_NEUTRALISER,
		SIZE_REPORTER,
		html,
		"</body></html>",
	].join("");
}

/**
 * Compose the shell an artifact of the `html` kind is rendered through.
 *
 * Layer 1 (this document) carries the policy — including the `frame-src 'none'`
 * that pins the artifact in place. Layer 2 (`buildArtifactDocument`) holds the
 * artifact.
 *
 * @param html - The artifact's HTML, exactly as its author wrote it.
 */
export function buildArtifactSrcdoc(html: string): string {
	const inner = escapeSrcdocAttribute(buildArtifactDocument(html));
	return [
		"<!doctype html><html>",
		HEAD(ARTIFACT_FRAME_CSP, SHELL_STYLE),
		"<body>",
		`<iframe id="artifact" title="Artifact content" sandbox="${ARTIFACT_FRAME_SANDBOX}" srcdoc="${inner}" style="display:block;width:100%;height:100%;border:none"></iframe>`,
		SIZE_RELAY,
		"</body></html>",
	].join("");
}
