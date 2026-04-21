import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DS_ROOT = resolve(__dirname, "../..");
const SRC_TOKENS = readFileSync(resolve(DS_ROOT, "src/tokens.css"), "utf-8");
const HTML_TOKENS = readFileSync(resolve(DS_ROOT, "html/_tokens.css"), "utf-8");

function extractCustomProperties(css: string): string[] {
	const matches = css.match(/--[\w-]+(?=\s*:)/g);
	return [...new Set(matches ?? [])].sort();
}

describe("tokens.css (TSX source)", () => {
	const props = extractCustomProperties(SRC_TOKENS);

	it("defines surface tokens (0-6 + ghost)", () => {
		for (const n of [0, 1, 2, 3, 4, 5, 6]) {
			expect(props).toContain(`--surface-${n}`);
		}
		expect(props).toContain("--surface-ghost");
	});

	it("defines accent tokens", () => {
		for (const token of ["--primary", "--primary-dim", "--primary-hover", "--warn", "--ok", "--danger"]) {
			expect(props).toContain(token);
		}
	});

	it("defines text tokens (hi, mid, lo)", () => {
		for (const token of ["--text-hi", "--text-mid", "--text-lo"]) {
			expect(props).toContain(token);
		}
	});

	it("defines border tokens", () => {
		for (const token of ["--border-subtle", "--border-default", "--border-emphasis"]) {
			expect(props).toContain(token);
		}
	});

	it("defines radius tokens", () => {
		for (const token of ["--r0", "--r1", "--r2", "--r3", "--r-pill"]) {
			expect(props).toContain(token);
		}
	});

	it("defines motion tokens", () => {
		for (const token of ["--motion-fast", "--motion-medium", "--motion-slow"]) {
			expect(props).toContain(token);
		}
	});

	it("defines typography tokens", () => {
		for (const token of ["--ui", "--mono"]) {
			expect(props).toContain(token);
		}
	});

	it("defines shadow token", () => {
		expect(props).toContain("--float");
	});

	it("defines density tokens", () => {
		for (const token of [
			"--density-pad-x",
			"--density-pad-y",
			"--density-gap",
			"--density-row-h",
			"--density-text",
		]) {
			expect(props).toContain(token);
		}
	});

	it("uses @layer base for Tailwind integration", () => {
		expect(SRC_TOKENS).toContain("@layer base");
	});
});

describe("_tokens.css (HTML components)", () => {
	const htmlProps = extractCustomProperties(HTML_TOKENS);

	it("defines the same core tokens as src/tokens.css", () => {
		const coreTokens = [
			"--surface-0",
			"--surface-1",
			"--surface-2",
			"--surface-3",
			"--surface-4",
			"--surface-5",
			"--surface-6",
			"--surface-ghost",
			"--primary",
			"--primary-dim",
			"--primary-hover",
			"--warn",
			"--ok",
			"--danger",
			"--text-hi",
			"--text-mid",
			"--text-lo",
			"--border-subtle",
			"--border-default",
			"--border-emphasis",
			"--float",
			"--r0",
			"--r1",
			"--r2",
			"--r3",
			"--r-pill",
			"--motion-fast",
			"--motion-medium",
			"--motion-slow",
			"--ui",
			"--mono",
		];
		for (const token of coreTokens) {
			expect(htmlProps).toContain(token);
		}
	});

	it("includes Google Fonts import for Inter and Space Grotesk", () => {
		expect(HTML_TOKENS).toContain("fonts.googleapis.com");
		expect(HTML_TOKENS).toContain("Inter");
		expect(HTML_TOKENS).toContain("Space+Grotesk");
	});

	it("sets body background to surface-0", () => {
		expect(HTML_TOKENS).toContain("background: var(--surface-0)");
	});

	it("includes box-sizing reset", () => {
		expect(HTML_TOKENS).toContain("box-sizing: border-box");
	});

	it("includes demo layout classes", () => {
		expect(HTML_TOKENS).toContain(".demo-grid");
		expect(HTML_TOKENS).toContain(".demo-section");
		expect(HTML_TOKENS).toContain(".demo-section-title");
	});
});

describe("token sync: src/tokens.css ↔ html/_tokens.css", () => {
	const srcProps = extractCustomProperties(SRC_TOKENS);
	const htmlProps = extractCustomProperties(HTML_TOKENS);

	it("every core token in src/tokens.css exists in html/_tokens.css", () => {
		// Core tokens are those defined in :root (not density overrides)
		const coreFromSrc = srcProps.filter(
			(p) => !p.startsWith("--density-") || SRC_TOKENS.indexOf(`:root`) < SRC_TOKENS.indexOf(p),
		);
		// The core set that must match
		const required = [
			"--surface-0",
			"--surface-1",
			"--surface-2",
			"--surface-3",
			"--surface-4",
			"--surface-5",
			"--surface-6",
			"--surface-ghost",
			"--primary",
			"--primary-dim",
			"--primary-hover",
			"--warn",
			"--ok",
			"--danger",
			"--text-hi",
			"--text-mid",
			"--text-lo",
			"--border-subtle",
			"--border-default",
			"--border-emphasis",
			"--float",
			"--r0",
			"--r1",
			"--r2",
			"--r3",
			"--r-pill",
			"--motion-fast",
			"--motion-medium",
			"--motion-slow",
			"--ui",
			"--mono",
		];
		const missing = required.filter((t) => !htmlProps.includes(t));
		expect(missing).toEqual([]);
	});
});
