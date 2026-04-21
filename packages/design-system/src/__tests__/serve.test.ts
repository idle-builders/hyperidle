import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SERVE_SCRIPT = resolve(__dirname, "../../scripts/serve.ts");
const PORT = 18098; // Use a non-standard port for tests
let serverProcess: ChildProcess;

beforeAll(async () => {
	serverProcess = spawn("bun", ["run", SERVE_SCRIPT], {
		env: { ...process.env, PORT: String(PORT) },
		stdio: "pipe",
	});

	// Wait for server to be ready
	await new Promise<void>((resolveP, reject) => {
		const timeout = setTimeout(() => reject(new Error("Server start timeout")), 5000);

		const checkReady = async (): Promise<void> => {
			try {
				await fetch(`http://localhost:${PORT}/`);
				clearTimeout(timeout);
				resolveP();
			} catch {
				setTimeout(checkReady, 100);
			}
		};
		checkReady();
	});
});

afterAll(() => {
	serverProcess?.kill();
});

describe("design system display server", () => {
	it("serves root as _catalog.html", async () => {
		const res = await fetch(`http://localhost:${PORT}/`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/html");
		const text = await res.text();
		expect(text).toContain("HyperIdle Design System");
	});

	it("serves component HTML files", async () => {
		const res = await fetch(`http://localhost:${PORT}/BetCard.html`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/html");
		const text = await res.text();
		expect(text).toContain('data-component="BetCard"');
	});

	it("serves _tokens.css", async () => {
		const res = await fetch(`http://localhost:${PORT}/_tokens.css`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/css");
	});

	it("serves theme CSS files", async () => {
		for (const theme of ["factory-dark", "calm-precision", "light-ops", "mono-machine"]) {
			const res = await fetch(`http://localhost:${PORT}/themes/${theme}.css`);
			expect(res.status, `${theme}.css should return 200`).toBe(200);
			expect(res.headers.get("content-type")).toBe("text/css");
		}
	});

	it("serves theme switcher JS", async () => {
		const res = await fetch(`http://localhost:${PORT}/themes/_switcher.js`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/javascript");
	});

	it("serves feedback.js bookmarklet", async () => {
		const res = await fetch(`http://localhost:${PORT}/feedback.js`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/javascript");
		const text = await res.text();
		expect(text).toContain("__ds-feedback-overlay");
	});

	it("returns 404 for nonexistent files", async () => {
		const res = await fetch(`http://localhost:${PORT}/nonexistent.html`);
		expect(res.status).toBe(404);
	});

	it("serves all 14 component files", async () => {
		const components = [
			"StatusChip",
			"Tag",
			"KeyValue",
			"NavItem",
			"SearchField",
			"ThreadRow",
			"BetCard",
			"PitchCard",
			"TaskCard",
			"KnowledgeRow",
			"NotificationRow",
			"EmptyState",
			"ErrorState",
			"Skeleton",
		];
		for (const name of components) {
			const res = await fetch(`http://localhost:${PORT}/${name}.html`);
			expect(res.status, `${name}.html should return 200`).toBe(200);
		}
	});

	it("sets CORS headers", async () => {
		const res = await fetch(`http://localhost:${PORT}/BetCard.html`);
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("sets no-store cache headers", async () => {
		const res = await fetch(`http://localhost:${PORT}/BetCard.html`);
		expect(res.headers.get("cache-control")).toBe("no-store");
	});
});
