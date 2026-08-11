// AZ6 probe — does an iframe inside the packaged desktop app inherit the preload bridge?
// Reproduces applications/desktop/src/main.ts webPreferences exactly, serves a host page
// over http (same shape as the real app: http://127.0.0.1:<port>), and reports what three
// different iframe configurations can see and do.
//
// Run: npx electron .pipeline/work/AZ6/probes/electron-frame-probe.cjs
const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PRELOAD = path.join(__dirname, "electron-frame-probe-preload.cjs");
fs.writeFileSync(
	PRELOAD,
	`const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("__HYPERIDLE__", {
  apiKey: "SECRET-API-KEY-FROM-PRELOAD",
  platform: "electron",
  credentials: { get: (n) => ipcRenderer.invoke("credentials:get", n) },
});
`,
);

const FRAME_BODY = `<!doctype html><meta charset="utf-8"><script>
function probe(name){
  const out = { name: name, hasBridge: typeof window.__HYPERIDLE__ !== "undefined" };
  out.apiKeySeen = out.hasBridge ? String(window.__HYPERIDLE__.apiKey) : null;
  try { out.parentTitle = window.parent.document.title; } catch (e) { out.parentTitle = "BLOCKED: " + e.name; }
  try { out.origin = String(window.origin); } catch (e) { out.origin = "throw " + e.name; }
  try { window.localStorage.setItem("x","1"); out.localStorage = "ok"; } catch (e) { out.localStorage = "BLOCKED: " + e.name; }
  try { out.cookie = String(document.cookie); } catch (e) { out.cookie = "BLOCKED: " + e.name; }
  out.scriptRan = true;
  fetch("/api/secret").then(r => r.text()).then(t => { out.sameOriginFetch = "ok: " + t; done(out); })
    .catch(e => { out.sameOriginFetch = "BLOCKED: " + e.message; done(out); });
}
function done(out){ window.parent.postMessage(JSON.stringify(out), "*"); }
</script>`;

const HOST = `<!doctype html><html><head><title>HOST PAGE</title></head><body>
<script>
const results = [];
window.addEventListener("message", (e) => {
  results.push(JSON.parse(e.data));
  if (results.length >= 4) { window.__RESULTS__ = results; }
});
</script>
<iframe id="a" sandbox="allow-scripts" srcdoc='${FRAME_BODY}<script>probe("1-sandbox-allow-scripts-only")<\/script>'></iframe>
<iframe id="b" sandbox="allow-scripts allow-same-origin" srcdoc='${FRAME_BODY}<script>probe("2-sandbox-allow-scripts-AND-same-origin")<\/script>'></iframe>
<iframe id="c" srcdoc='${FRAME_BODY}<script>probe("3-no-sandbox-attribute")<\/script>'></iframe>
<iframe id="d" sandbox="allow-scripts" srcdoc='<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; script-src &apos;unsafe-inline&apos;; style-src &apos;unsafe-inline&apos;">${FRAME_BODY}<script>probe("4-sandbox-plus-meta-csp-default-src-none")<\/script>'></iframe>
</body></html>`;

const server = http.createServer((req, res) => {
	if (req.url === "/api/secret") {
		res.writeHead(200, { "content-type": "text/plain" });
		res.end("THE-APP-DATA");
		return;
	}
	res.writeHead(200, { "content-type": "text/html" });
	res.end(HOST);
});

app.whenReady().then(() => {
	server.listen(0, "127.0.0.1", async () => {
		const port = server.address().port;
		const win = new BrowserWindow({
			show: false,
			webPreferences: {
				preload: PRELOAD,
				contextIsolation: true,
				sandbox: true,
			},
		});
		await win.loadURL(`http://127.0.0.1:${port}/`);
		await new Promise((r) => setTimeout(r, 2500));
		const results = await win.webContents.executeJavaScript("JSON.stringify(window.__RESULTS__)");
		const parsed = JSON.parse(results ?? "null");
		process.stdout.write(`\nELECTRON ${process.versions.electron} / Chromium ${process.versions.chrome}\n`);
		for (const r of parsed ?? []) {
			process.stdout.write(`\n--- ${r.name}\n`);
			for (const [k, v] of Object.entries(r)) {
				if (k !== "name") process.stdout.write(`    ${k}: ${v}\n`);
			}
		}
		fs.writeFileSync(path.join(__dirname, "electron-frame-probe-result.json"), JSON.stringify(parsed, null, 2));
		app.exit(0);
	});
});
