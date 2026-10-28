/**
 * The box an app runs in. An app is a whole page an agent or a person wrote — its own styles and
 * scripts — so it is untrusted, and it runs whole inside a box it cannot reach out of. This file is
 * the only place the sandbox, the policy and the box's shell are written; `AppFrame` takes the
 * page and nothing else, so no caller can loosen them.
 */

// @lore: two layers — a page's own navigation ignores its CSP; nested in our shell it hits the shell's frame-src 'none' (measured: one layer leaked)

// @lore: allow-scripts WITHOUT allow-same-origin — together they hand the app window.parent, the API key and its own sandbox (measured)
export const APP_SANDBOX = "allow-scripts";

// @lore: no 'self' — in a srcdoc frame it means HyperIdle's origin (8 channels to our API, measured); the sandbox alone lets fetch out

// @lore: webrtc 'block' is not enforced by the Chromium we ship (UDP still left, measured); NO_WEBRTC is what closes it — keep both
const POLICY = [
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

/** Deletes the WebRTC constructors before the app's own script runs, beyond its reach to restore. */
const NO_WEBRTC = `<script>(function(){
var names=["RTCPeerConnection","webkitRTCPeerConnection","RTCDataChannel","RTCSessionDescription","RTCIceCandidate"];
for(var i=0;i<names.length;i++){
try{Object.defineProperty(window,names[i],{value:undefined,configurable:false,writable:false});}
catch(e){try{delete window[names[i]];}catch(e2){}}
}
})();</script>`;

const head = (style: string): string =>
	`<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}"><meta name="viewport" content="width=device-width, initial-scale=1">${style}</head>`;

/** The app's own document: the policy, the WebRTC removal, then the page exactly as written. */
export function appDocument(html: string): string {
	return [
		"<!doctype html><html>",
		head("<style>html{color-scheme:light;background:Canvas}</style>"),
		"<body>",
		NO_WEBRTC,
		html,
		"</body></html>",
	].join("");
}

// @lore: the app lives inside the shell's srcdoc ATTRIBUTE — escape & before " or the page breaks out into the shell, where nothing stops it navigating away
const inAttribute = (text: string): string =>
	text.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

/** The shell the app frame renders: it carries the policy that pins the app, and the app nested inside it. */
export function appSrcdoc(html: string): string {
	return [
		"<!doctype html><html>",
		head(
			"<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;color-scheme:light;background:Canvas}</style>",
		),
		"<body>",
		`<iframe sandbox="${APP_SANDBOX}" srcdoc="${inAttribute(appDocument(html))}" style="display:block;width:100%;height:100%;border:none"></iframe>`,
		"</body></html>",
	].join("");
}

const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
};
const decode = (text: string): string =>
	text.replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e).trim();

/** What an app says about itself — its meta description, else its title — read as text, never run. */
export function appSummary(html: string): string | null {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		if (!/\bname\s*=\s*["']description["']/i.test(tag)) continue;
		const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
		if (content) return decode(content);
	}
	const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
	return title ? decode(title) : null;
}
