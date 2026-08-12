// AZ6 review round — measure EVERY egress channel out of a sealed artifact frame,
// under three policy shapes, in the exact Electron the desktop app pins.
//
// Two real listeners: HTTP (every URL-fetching channel) and UDP (WebRTC/STUN).
// A channel counts as OPEN only if a packet actually arrived at a listener —
// the artifact's own account of itself is not trusted.
//
// Run: npx electron .pipeline/work/AZ6/probes/egress-matrix-probe.cjs
const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const dgram = require("node:dgram");
const fs = require("node:fs");
const path = require("node:path");

const httpHits = [];
const udpHits = [];

const outside = http.createServer((req, res) => {
	httpHits.push(req.url ?? "");
	res.writeHead(200, {
		"content-type": "text/html",
		"access-control-allow-origin": "*",
	});
	res.end("<h1>OUTSIDE PAGE LOADED</h1>");
});
const udp = dgram.createSocket("udp4");
udp.on("message", (_m, rinfo) => udpHits.push(`udp:${rinfo.port}`));

const BASE_CSP = [
	"default-src 'none'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"media-src 'self' data:",
	"font-src 'self' data:",
	"connect-src 'none'",
	"object-src 'none'",
	"frame-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
];

/** Removes the WebRTC constructors before the artifact's own script runs. */
const RTC_PRELUDE = `<script>(function(){
var kill=function(w){try{["RTCPeerConnection","webkitRTCPeerConnection","RTCDataChannel"].forEach(function(k){
try{Object.defineProperty(w,k,{value:undefined,configurable:false,writable:false});}catch(e){try{delete w[k];}catch(e2){}}
});}catch(e){}};
kill(window);
})();</script>`;

/** Every channel an artifact could use to reach a host it chose. */
function channels(port, udpPort) {
	const u = (name) => `http://127.0.0.1:${port}/${name}`;
	return `
<style>
  #cssurl { background-image: url("${u("CSS-URL")}") }
  @font-face { font-family: X; src: url("${u("FONT")}") }
  #fonty { font-family: X }
</style>
<div id="cssurl"></div><div id="fonty">f</div>
<link rel="prefetch" href="${u("PREFETCH")}">
<link rel="preload" as="image" href="${u("PRELOAD")}">
<iframe src="${u("NESTED-IFRAME")}"></iframe>
<img src="${u("IMG")}">
<form id="f" method="GET" action="${u("FORM")}"><input name="a" value="1"></form>
<a id="blank" href="${u("TARGET-BLANK")}" target="_blank">x</a>
<script>
function t(name, fn){ try { fn(); } catch (e) { /* the listener is the judge */ } }
t("fetch", () => fetch("${u("FETCH")}"));
t("xhr", () => { var x = new XMLHttpRequest(); x.open("GET", "${u("XHR")}"); x.send(); });
t("websocket", () => new WebSocket("ws://127.0.0.1:${port}/WEBSOCKET"));
t("eventsource", () => new EventSource("${u("EVENTSOURCE")}"));
t("sendbeacon", () => navigator.sendBeacon && navigator.sendBeacon("${u("SENDBEACON")}", "x"));
t("form", () => document.getElementById("f").submit());
t("targetblank", () => document.getElementById("blank").click());
t("windowopen", () => window.open("${u("WINDOW-OPEN")}"));
t("topnav", () => { window.top.location.href = "${u("TOP-NAV")}"; });
t("parentnav", () => { window.parent.location.href = "${u("PARENT-NAV")}"; });
t("parentnav-replace", () => { window.parent.location.replace("${u("PARENT-NAV-REPLACE")}"); });
t("ancestor-open", () => { window.parent.open && window.parent.open("${u("PARENT-OPEN")}"); });
t("webrtc", () => {
  var pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${udpPort}" }] });
  pc.createDataChannel("x");
  pc.createOffer().then(function (o) { return pc.setLocalDescription(o); });
});
// Escape attempt: fetch a fresh realm from a nested frame and take its constructor.
t("webrtc-via-nested-realm", () => {
  var f = document.createElement("iframe");
  f.setAttribute("srcdoc", "<b>realm</b>");
  document.body.appendChild(f);
  setTimeout(function(){
    try {
      var W = f.contentWindow;
      var R = W.RTCPeerConnection || W.webkitRTCPeerConnection;
      var pc2 = new R({ iceServers: [{ urls: "stun:127.0.0.1:${udpPort}" }] });
      pc2.createDataChannel("y");
      pc2.createOffer().then(function (o) { return pc2.setLocalDescription(o); });
      document.title = "NESTED-REALM-RTC-WORKED";
    } catch (e) { document.title = "NESTED-REALM-BLOCKED:" + e.name; }
  }, 250);
});
// Self-navigation last: it destroys the document, so everything above must fire first.
setTimeout(function(){ t("selfnav", function(){ location.href = "${u("SELF-NAV")}"; }); }, 900);
</script>`;
}

/** Single-layer document: the shape shipped today. */
function singleLayer(csp, body) {
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}"></head><body>${body}</body></html>`;
}

/**
 * Two-layer document: an outer shell we compose whose own policy carries
 * `frame-src 'none'`, holding the artifact in a nested srcdoc frame. If a nested
 * context's navigations are checked against its EMBEDDER's frame-src, the inner
 * frame cannot navigate itself to a chosen host. This is the shape the MCP Apps
 * spec calls a "sandbox proxy", minus the separate origin.
 */
function twoLayer(csp, body, useRtcPrelude = false) {
	const inner = `<!doctype html><html><head><meta charset="utf-8"></head><body>${useRtcPrelude ? RTC_PRELUDE : ""}${body}</body></html>`;
	const esc = inner.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}"></head><body style="margin:0"><iframe id="inner" style="width:100%;height:100%;border:0" sandbox="allow-scripts" srcdoc="${esc}"></iframe></body></html>`;
}

async function measure(win, label, srcdoc, wait = 2600) {
	httpHits.length = 0;
	udpHits.length = 0;
	await win.webContents.executeJavaScript(`
		(function(){
			var old = document.getElementById("probe"); if (old) old.remove();
			var f = document.createElement("iframe");
			f.id = "probe"; f.setAttribute("sandbox", "allow-scripts");
			f.style.width = "600px"; f.style.height = "300px";
			f.srcdoc = ${JSON.stringify(srcdoc)};
			document.body.appendChild(f);
		})();
	`);
	await new Promise((r) => setTimeout(r, wait));
	const hits = [...new Set(httpHits.map((h) => h.split("?")[0].replace(/^\//, "")))].sort();
	const udpCount = udpHits.length;
	return { label, httpReached: hits, udpPackets: udpCount };
}

app.whenReady().then(() => {
	outside.listen(0, "127.0.0.1", () => {
		udp.bind(0, "127.0.0.1", async () => {
			const port = outside.address().port;
			const udpPort = udp.address().port;
			const body = channels(port, udpPort);

			const host = http.createServer((_q, res) => {
				res.writeHead(200, { "content-type": "text/html" });
				res.end("<!doctype html><html><head><title>HOST</title></head><body></body></html>");
			});
			host.listen(0, "127.0.0.1", async () => {
				const win = new BrowserWindow({
					show: false,
					webPreferences: { contextIsolation: true, sandbox: true },
				});
				await win.loadURL(`http://127.0.0.1:${host.address().port}/`);

				const results = [];
				results.push(await measure(win, "A: shipped policy, single layer", singleLayer(BASE_CSP, body)));
				results.push(
					await measure(
						win,
						"B: shipped policy + webrtc 'block', single layer",
						singleLayer([...BASE_CSP, "webrtc 'block'"], body),
					),
				);
				results.push(
					await measure(
						win,
						"C: policy + webrtc 'block', two layers (outer frame-src 'none')",
						twoLayer([...BASE_CSP, "webrtc 'block'"], body),
					),
				);
				results.push(
					await measure(
						win,
						"D: two layers + WebRTC constructors removed before the artifact runs",
						twoLayer([...BASE_CSP, "webrtc 'block'"], body, true),
					),
				);

				process.stdout.write(
					`\nELECTRON ${process.versions.electron} / Chromium ${process.versions.chrome}\n`,
				);
				for (const r of results) {
					process.stdout.write(`\n--- ${r.label}\n`);
					process.stdout.write(`    HTTP channels that REACHED: ${JSON.stringify(r.httpReached)}\n`);
					process.stdout.write(`    UDP packets (WebRTC):       ${r.udpPackets}\n`);
				}
				fs.writeFileSync(
					path.join(__dirname, "egress-matrix-result.json"),
					JSON.stringify({ electron: process.versions.electron, chromium: process.versions.chrome, results }, null, 2),
				);
				app.exit(0);
			});
		});
	});
});
