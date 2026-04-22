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
		for (const token of [
			"--primary",
			"--primary-dim",
			"--primary-hover",
			"--warn",
			"--ok",
			"--danger",
		]) {
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

	it("defines lucid-dark theme block", () => {
		expect(SRC_TOKENS).toContain('[data-theme="lucid-dark"]');
	});

	it("defines lucid-light theme block", () => {
		expect(SRC_TOKENS).toContain('[data-theme="lucid-light"]');
	});

	it("includes prefers-color-scheme light media query", () => {
		expect(SRC_TOKENS).toContain("@media (prefers-color-scheme: light)");
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

	it("includes Google Fonts import for Geist and Geist Mono", () => {
		expect(HTML_TOKENS).toContain("fonts.googleapis.com");
		expect(HTML_TOKENS).toContain("Geist");
		expect(HTML_TOKENS).toContain("Geist+Mono");
	});

	it("defines lucid-dark theme block", () => {
		expect(HTML_TOKENS).toContain('[data-theme="lucid-dark"]');
	});

	it("defines lucid-light theme block", () => {
		expect(HTML_TOKENS).toContain('[data-theme="lucid-light"]');
	});

	it("includes prefers-color-scheme light media query", () => {
		expect(HTML_TOKENS).toContain("@media (prefers-color-scheme: light)");
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
	const htmlProps = extractCustomProperties(HTML_TOKENS);

	it("every core token in src/tokens.css exists in html/_tokens.css", () => {
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
