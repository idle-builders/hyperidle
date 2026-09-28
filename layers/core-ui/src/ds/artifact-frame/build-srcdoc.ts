// @lore: two-layer iframe — single-layer escapable via location.href; nesting puts artifact in a nested context blocked by shell's frame-src 'none'

// @lore: escapeSrcdocAttribute escapes & before " — srcdoc is double-quoted; unescaped & or " breaks out to the shell where nothing blocks navigation

// @lore: allow-scripts WITHOUT allow-same-origin — both together let frame reach window.parent and remove its sandbox; allow-scripts alone blocks all of that

// @lore: sandbox alone not sufficient — frame can exfiltrate via fetch + image beacon; CSP closes those; weakening connect-src or img-src reopens it

// @lore: no prop for sandbox/policy/shell — call site cannot loosen any of them; that absence is the enforcement mechanism

// @lore: srcdoc inherits embedding page's CSP — an app-wide CSP without 'unsafe-inline' in script-src will silently kill artifact scripts

export const ARTIFACT_FRAME_SANDBOX = "allow-scripts";

// @lore: no 'self' in CSP — srcdoc opaque origin; Chromium maps 'self' to embedding app's origin; artifact reaches server via 8 channels with it (measured)

// @lore: frame-src 'none' stops artifact self-navigation AND nested embeds; removing it re-opens the escape path

// @lore: webrtc 'block' not enforced in Chromium 150 (UDP still emitted, measured); RTC_NEUTRALISER is the real block; do not remove based on this directive
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

export const ARTIFACT_SIZE_CHANGED_METHOD = "ui/notifications/size-changed";

export const FRAME_INITIAL_HEIGHT = 420;

export const FRAME_MIN_HEIGHT = 180;

// @lore: FRAME_MAX_HEIGHT — reporter shares document with untrusted artifact code; artifact can lie about height; cap limits the blast radius
export const FRAME_MAX_HEIGHT = 1200;

export function clampFrameHeight(height: number): number {
	if (!Number.isFinite(height)) return FRAME_MIN_HEIGHT;
	if (height < FRAME_MIN_HEIGHT) return FRAME_MIN_HEIGHT;
	if (height > FRAME_MAX_HEIGHT) return FRAME_MAX_HEIGHT;
	return Math.round(height);
}

export function escapeSrcdocAttribute(document: string): string {
	return document.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

// @lore: RTC_NEUTRALISER — webrtc CSP not enforced in Chromium 150 (4 UDP measured); RTCPeerConnection redefined non-writable; zero packets with this in place
const RTC_NEUTRALISER = `<script>(function(){
var names=["RTCPeerConnection","webkitRTCPeerConnection","mozRTCPeerConnection","RTCDataChannel","RTCSessionDescription","RTCIceCandidate"];
for(var i=0;i<names.length;i++){
try{Object.defineProperty(window,names[i],{value:undefined,configurable:false,writable:false});}
catch(e){try{delete window[names[i]];}catch(e2){}}
}
})();</script>`;

// @lore: SIZE_REPORTER measures body not html — documentElement fills viewport (reports current height, not content height); body is auto-height and hugs content

// @lore: SIZE_REPORTER injected BEFORE artifact markup — unclosed <script> or <!-- in artifact swallows following content; reporter must precede user html
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

const SHELL_STYLE =
	"<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background-color:#fff;color-scheme:light}</style>";

const ARTIFACT_DOC_STYLE = "<style>html,body{background-color:#fff;color-scheme:light}</style>";

export function buildArtifactDocument(html: string): string {
	return [
		"<!doctype html><html>",
		HEAD(ARTIFACT_FRAME_CSP, ARTIFACT_DOC_STYLE),
		"<body>",
		RTC_NEUTRALISER,
		SIZE_REPORTER,
		html,
		"</body></html>",
	].join("");
}

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
