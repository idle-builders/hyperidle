// AZ6 review round 2 — does `'self'` in the artifact policy resolve to the
// EMBEDDING APP'S origin?
//
// The artifact runs in a srcdoc document with an opaque origin, so `'self'` was
// assumed to match nothing. This measures it per directive, against the app's own
// origin, in the exact Electron the desktop app pins. The app server counts every
// request it receives, so a same-origin channel is observable here in a way the
// third-party listener could never see.
//
// Run: npx electron .pipeline/work/AZ6/probes/same-origin-probe.cjs
const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let appHits = [];

const WITH_SELF = [
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
	"webrtc 'block'",
];

const WITHOUT_SELF = [
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
];

/** Same-origin egress attempts — every URL is relative, so it targets the app. */
const SAME_ORIGIN_BODY = `
<style>
  #c { background-image: url("/api/leak?ch=CSS-URL") }
  @font-face { font-family: L; src: url("/api/leak?ch=FONT") }
  #f { font-family: L }
</style>
<div id="c">.</div><div id="f">.</div>
<link rel="prefetch" href="/api/leak?ch=PREFETCH">
<link rel="preload" as="image" href="/api/leak?ch=PRELOAD">
<img src="/api/leak?ch=IMG" alt="">
<video src="/api/leak?ch=MEDIA"></video>
<script src="/api/leak?ch=SCRIPT-SRC"></script>
<script>
function t(fn){ try { fn(); } catch (e) {} }
t(function(){ fetch("/api/leak?ch=FETCH"); });
t(function(){ var x=new XMLHttpRequest(); x.open("GET","/api/leak?ch=XHR"); x.send(); });
t(function(){ navigator.sendBeacon && navigator.sendBeacon("/api/leak?ch=SENDBEACON","x"); });
t(function(){ new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/api/leak?ch=WEBSOCKET"); });
t(function(){ new EventSource("/api/leak?ch=EVENTSOURCE"); });
t(function(){ var i=new Image(); i.src="/api/leak?ch=IMG-DYNAMIC"; });
</script>`;

function shell(csp) {
	const inner = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}"></head><body>${SAME_ORIGIN_BODY}</body></html>`
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;");
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}"></head><body style="margin:0"><iframe id="artifact" sandbox="allow-scripts" srcdoc="${inner}" style="width:100%;height:100%;border:0"></iframe></body></html>`;
}

async function measure(win, label, srcdoc) {
	appHits = [];
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
	await new Promise((r) => setTimeout(r, 2500));
	return { label, sameOriginChannelsReached: [...new Set(appHits)].sort() };
}

app.whenReady().then(() => {
	const server = http.createServer((req, res) => {
		const url = req.url ?? "";
		if (url.startsWith("/api/leak")) {
			const ch = new URL(url, "http://x").searchParams.get("ch") ?? "?";
			appHits.push(ch);
			res.writeHead(200, { "content-type": "text/plain" });
			res.end("leaked");
			return;
		}
		res.writeHead(200, { "content-type": "text/html" });
		res.end("<!doctype html><html><head><title>APP</title></head><body></body></html>");
	});
	server.listen(0, "127.0.0.1", async () => {
		const win = new BrowserWindow({
			show: false,
			webPreferences: { contextIsolation: true, sandbox: true },
		});
		await win.loadURL(`http://127.0.0.1:${server.address().port}/`);

		const results = [];
		results.push(await measure(win, "policy WITH 'self' (as shipped)", shell(WITH_SELF)));
		results.push(await measure(win, "policy WITHOUT 'self'", shell(WITHOUT_SELF)));

		process.stdout.write(
			`\nELECTRON ${process.versions.electron} / Chromium ${process.versions.chrome}\n`,
		);
		for (const r of results) {
			process.stdout.write(`\n--- ${r.label}\n`);
			process.stdout.write(
				`    same-origin channels that REACHED the app: ${JSON.stringify(r.sameOriginChannelsReached)}\n`,
			);
		}
		fs.writeFileSync(
			path.join(__dirname, "same-origin-result.json"),
			JSON.stringify({ chromium: process.versions.chrome, results }, null, 2),
		);
		app.exit(0);
	});
});
