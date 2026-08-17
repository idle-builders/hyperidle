// AZ6 — the sealed artifact frame.
//
// The isolation claim has to be mechanically true, not structurally likely: both
// layers are sandboxed to exactly "allow-scripts", the shell leads with the policy,
// and the artifact is escaped into the shell's srcdoc attribute so it cannot break
// out into the shell. The behavioural half — a hostile artifact failing every
// egress channel — lives in AZ6-artifact-frame.spec.ts, because a jsdom iframe
// enforces neither a sandbox nor a policy.

// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ArtifactFrame } from "../ArtifactFrame.js";
import {
	ARTIFACT_FRAME_CSP,
	ARTIFACT_FRAME_SANDBOX,
	ARTIFACT_SIZE_CHANGED_METHOD,
	buildArtifactDocument,
	buildArtifactSrcdoc,
	clampFrameHeight,
	escapeSrcdocAttribute,
	FRAME_MAX_HEIGHT,
	FRAME_MIN_HEIGHT,
} from "../artifact-frame/build-srcdoc.js";
import { composeArtifactBody } from "../kinds/compose-artifact-body.js";

afterEach(cleanup);

const ARTIFACT = "<h1>Signups</h1><script>document.title='ran'</script>";

describe("the policy", () => {
	it("allows no network at all and names no remote host", () => {
		expect(ARTIFACT_FRAME_CSP).toContain("default-src 'none'");
		expect(ARTIFACT_FRAME_CSP).toContain("connect-src 'none'");
		expect(ARTIFACT_FRAME_CSP).not.toMatch(/https?:/);
		expect(ARTIFACT_FRAME_CSP).not.toContain("*");
	});

	it("keeps frame-src 'none' — the directive that pins the artifact in its box", () => {
		// Not decoration: because the artifact is a NESTED context inside the shell,
		// this is what stops it navigating itself to a host of its choosing.
		expect(ARTIFACT_FRAME_CSP).toContain("frame-src 'none'");
	});
});

describe("buildArtifactDocument (the layer the artifact runs in)", () => {
	it("leads with the policy meta before any artifact content", () => {
		const doc = buildArtifactDocument(ARTIFACT);
		const metaIndex = doc.indexOf(`<meta http-equiv="Content-Security-Policy"`);
		expect(metaIndex).toBeGreaterThanOrEqual(0);
		expect(metaIndex).toBeLessThan(doc.indexOf("Signups"));
	});

	it("keeps the artifact's own markup verbatim — nothing is stripped", () => {
		const doc = buildArtifactDocument(ARTIFACT);
		expect(doc).toContain("<script>document.title='ran'</script>");
		expect(doc).toContain("<h1>Signups</h1>");
	});

	it("takes the WebRTC constructors away before the artifact's script runs", () => {
		// connect-src does not cover WebRTC and Chromium ignores the webrtc directive,
		// so the constructors are removed instead — and removed first.
		const doc = buildArtifactDocument(ARTIFACT);
		const kill = doc.indexOf("RTCPeerConnection");
		expect(kill).toBeGreaterThanOrEqual(0);
		expect(kill).toBeLessThan(doc.indexOf("Signups"));
	});

	it("emits the height reporter before the artifact, so an unclosed tag cannot eat it", () => {
		const doc = buildArtifactDocument(ARTIFACT);
		expect(doc.indexOf(ARTIFACT_SIZE_CHANGED_METHOD)).toBeLessThan(doc.indexOf("Signups"));
	});

	it("gives the document a white background so content is legible regardless of the app theme", () => {
		// The artifact runs inside the app's dark surface in dark mode. Without an
		// explicit white background on the wrapper document, the browser's dark-mode
		// default makes dark text invisible against a dark canvas. This is the surface
		// given to the artifact — not a style injected into the artifact's own markup.
		const doc = buildArtifactDocument(ARTIFACT);
		expect(doc).toContain("background-color:#fff");
	});

	it("declares color-scheme:light so browser-rendered controls use light defaults", () => {
		// color-scheme is inherited from the embedding app in dark mode; without an
		// explicit override, scrollbars and form controls render in dark colours.
		const doc = buildArtifactDocument(ARTIFACT);
		expect(doc).toContain("color-scheme:light");
	});

	it("sets the white surface in the head — before any artifact markup can override it", () => {
		const doc = buildArtifactDocument(ARTIFACT);
		const headClose = doc.indexOf("</head>");
		const bgIndex = doc.indexOf("background-color:#fff");
		expect(bgIndex).toBeGreaterThanOrEqual(0);
		expect(bgIndex).toBeLessThan(headClose);
	});
});

describe("escapeSrcdocAttribute", () => {
	it("neutralises the two characters that can end a double-quoted attribute", () => {
		expect(escapeSrcdocAttribute('a"b')).toBe("a&quot;b");
		expect(escapeSrcdocAttribute("a&b")).toBe("a&amp;b");
	});

	it('escapes & before " so an escape sequence cannot be reconstituted', () => {
		// If " were replaced first, the &quot; it produces would then have its & escaped
		// into &amp;quot; — harmless — but if & were escaped after, an artifact could
		// write &quot; itself and have it decode back into a real quote.
		expect(escapeSrcdocAttribute("&quot;")).toBe("&amp;quot;");
	});

	it("leaves an artifact no way to close the attribute", () => {
		const hostile = `x" onload="steal()" y="`;
		expect(escapeSrcdocAttribute(hostile)).not.toContain('"');
	});
});

describe("buildArtifactSrcdoc (the shell)", () => {
	it("puts the artifact in a nested frame rather than running it directly", () => {
		const shell = buildArtifactSrcdoc(ARTIFACT);
		expect(shell).toContain('<iframe id="artifact"');
		expect(shell).toContain(`sandbox="${ARTIFACT_FRAME_SANDBOX}"`);
	});

	it("carries the policy on the shell itself — that is where frame-src applies", () => {
		expect(buildArtifactSrcdoc(ARTIFACT)).toContain(ARTIFACT_FRAME_CSP);
	});

	it("escapes the artifact into the nested frame's attribute", () => {
		const shell = buildArtifactSrcdoc('<p title="x">&</p>');
		// The artifact's own quotes and ampersands never appear raw inside the attribute.
		const attr = shell.slice(shell.indexOf('srcdoc="') + 8, shell.lastIndexOf('" style='));
		expect(attr).not.toContain('"');
		expect(attr).toContain("title=&quot;x&quot;");
		expect(attr).toContain("&amp;");
	});

	it("cannot be tricked by an artifact that writes escape sequences itself", () => {
		// An artifact containing a literal &quot; must not have it decode back into a
		// real quote once the browser parses the attribute.
		const shell = buildArtifactSrcdoc("<p>&quot;</p>");
		const attr = shell.slice(shell.indexOf('srcdoc="') + 8, shell.lastIndexOf('" style='));
		expect(attr).toContain("&amp;quot;");
		expect(attr).not.toContain('"');
	});

	it("relays its child's size notification", () => {
		const shell = buildArtifactSrcdoc(ARTIFACT);
		expect(shell).toContain(ARTIFACT_SIZE_CHANGED_METHOD);
	});
});

describe("clampFrameHeight", () => {
	it("refuses a height the artifact made up", () => {
		expect(clampFrameHeight(10_000_000)).toBe(FRAME_MAX_HEIGHT);
		expect(clampFrameHeight(-1)).toBe(FRAME_MIN_HEIGHT);
		expect(clampFrameHeight(Number.NaN)).toBe(FRAME_MIN_HEIGHT);
		expect(clampFrameHeight(600)).toBe(600);
	});
});

describe("ArtifactFrame", () => {
	it("renders an iframe sandboxed to exactly allow-scripts", () => {
		const { container } = render(<ArtifactFrame html={ARTIFACT} />);
		const frame = container.querySelector("iframe");
		expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
		expect(ARTIFACT_FRAME_SANDBOX).toBe("allow-scripts");
	});

	it("never grants same-origin — the pair that lets a frame delete its own sandbox", () => {
		const { container } = render(<ArtifactFrame html={ARTIFACT} />);
		const sandbox = container.querySelector("iframe")?.getAttribute("sandbox") ?? "";
		for (const token of [
			"allow-same-origin",
			"allow-popups",
			"allow-forms",
			"allow-modals",
			"allow-downloads",
			"allow-top-navigation",
		]) {
			expect(sandbox).not.toContain(token);
		}
	});

	it("serves the artifact through srcdoc, so nothing is fetched over the network", () => {
		const { container } = render(<ArtifactFrame html={ARTIFACT} />);
		const frame = container.querySelector("iframe");
		expect(frame?.getAttribute("src")).toBeNull();
		expect(frame?.getAttribute("srcdoc") ?? "").toContain(ARTIFACT_FRAME_CSP);
	});

	it("grows to the height the document reports", () => {
		const { container } = render(<ArtifactFrame html={ARTIFACT} />);
		const frame = container.querySelector("iframe") as HTMLIFrameElement;
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						jsonrpc: "2.0",
						method: ARTIFACT_SIZE_CHANGED_METHOD,
						params: { width: 800, height: 640 },
					},
					source: frame.contentWindow,
				}),
			);
		});
		expect(frame.style.height).toBe("640px");
	});

	it("ignores a height message that did not come from its own frame", () => {
		const { container } = render(<ArtifactFrame html={ARTIFACT} />);
		const frame = container.querySelector("iframe") as HTMLIFrameElement;
		const before = frame.style.height;
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						jsonrpc: "2.0",
						method: ARTIFACT_SIZE_CHANGED_METHOD,
						params: { width: 800, height: 640 },
					},
					source: window,
				}),
			);
		});
		expect(frame.style.height).toBe(before);
	});

	it("caps a dishonest height — the reporter shares a document with untrusted code", () => {
		const { container } = render(<ArtifactFrame html={ARTIFACT} />);
		const frame = container.querySelector("iframe") as HTMLIFrameElement;
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						jsonrpc: "2.0",
						method: ARTIFACT_SIZE_CHANGED_METHOD,
						params: { width: 8, height: 9_999_999 },
					},
					source: frame.contentWindow,
				}),
			);
		});
		expect(frame.style.height).toBe(`${FRAME_MAX_HEIGHT}px`);
	});
});

describe("what the user is told about the box", () => {
	it("says the artifact is sealed", () => {
		const { container } = render(<ArtifactFrame html={ARTIFACT} />);
		expect(container.querySelector("[data-artifact-sealed-note]")?.textContent).toMatch(/sealed/i);
	});

	it("describes the box rather than promising an absolute", () => {
		// The note sits under agent output a person is deciding whether to trust, so it
		// says what the frame is and stops there. A sentence that promises nothing can
		// escape is only true until the next unenumerated channel turns up.
		const { container } = render(<ArtifactFrame html={ARTIFACT} />);
		const note = container.querySelector("[data-artifact-sealed-note]")?.textContent ?? "";
		expect(note).not.toMatch(/safe|harmless|trusted|verified/i);
		expect(note).not.toMatch(/can'?t reach|no access|cannot reach|never/i);
	});
});

describe("the html kind reaches the frame", () => {
	it("composes an html artifact as a sealed frame, not as its own source text", () => {
		const { container } = render(
			<>{composeArtifactBody("html", { kind: "html", html: ARTIFACT })}</>,
		);
		expect(container.querySelector("iframe")).toBeTruthy();
		expect(container.querySelector("[data-block-unknown-pill]")).toBeNull();
		expect(container.textContent).not.toContain("document.title");
	});

	it("renders the frame without needing a sanitiser — isolation replaced stripping", () => {
		const { container } = render(
			<>{composeArtifactBody("html", { kind: "html", html: "<button>go</button>" })}</>,
		);
		const frame = container.querySelector("iframe");
		expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
		expect(frame?.getAttribute("srcdoc") ?? "").toContain("<button>go</button>");
	});

	it("says an html artifact is empty instead of painting an empty frame", () => {
		const { container } = render(<>{composeArtifactBody("html", { kind: "html", html: "   " })}</>);
		expect(container.querySelector("iframe")).toBeNull();
		expect(container.textContent).toMatch(/empty/i);
	});
});
