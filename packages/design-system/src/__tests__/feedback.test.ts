import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FEEDBACK_SCRIPT = resolve(__dirname, "../../scripts/feedback-overlay.js");
const FEEDBACK_DOC = resolve(__dirname, "../../FEEDBACK.md");

describe("feedback overlay script", () => {
	it("exists", () => {
		expect(existsSync(FEEDBACK_SCRIPT)).toBe(true);
	});

	const content = existsSync(FEEDBACK_SCRIPT) ? readFileSync(FEEDBACK_SCRIPT, "utf-8") : "";

	it("is valid JavaScript (contains IIFE)", () => {
		// File starts with JSDoc comment, then has an arrow IIFE
		expect(content).toContain("(() => {");
		expect(content).toContain("__ds-feedback-overlay");
	});

	it("creates the overlay element", () => {
		expect(content).toContain('document.createElement("div")');
		expect(content).toContain("__ds-feedback-overlay");
	});

	it("supports element selection via click", () => {
		expect(content).toContain("mousemove");
		expect(content).toContain("click");
		expect(content).toContain("__ds-highlight");
	});

	it("supports CSS property tweaking", () => {
		expect(content).toContain("font-size");
		expect(content).toContain("padding");
		expect(content).toContain("background");
		expect(content).toContain("setProperty");
	});

	it("generates structured output for Claude", () => {
		expect(content).toContain("Copy for Claude");
		expect(content).toContain("clipboard");
		expect(content).toContain("## Design Feedback");
	});

	it("reads data-component attributes for context", () => {
		expect(content).toContain("data-component");
		expect(content).toContain("data-tier");
	});

	it("captures computed styles", () => {
		expect(content).toContain("getComputedStyle");
	});

	it("supports drag to reposition the panel", () => {
		expect(content).toContain("dragging");
		expect(content).toContain("mousedown");
	});

	it("has a close button", () => {
		expect(content).toContain("__ds-close");
	});

	it("is idempotent (checks for existing overlay)", () => {
		expect(content).toContain('getElementById("__ds-feedback-overlay")');
	});
});

describe("FEEDBACK.md documentation", () => {
	it("exists", () => {
		expect(existsSync(FEEDBACK_DOC)).toBe(true);
	});

	const content = existsSync(FEEDBACK_DOC) ? readFileSync(FEEDBACK_DOC, "utf-8") : "";

	it("documents the bookmarklet approach", () => {
		expect(content).toContain("Bookmarklet");
		expect(content).toContain("feedback.js");
	});

	it("documents Vibe Annotations", () => {
		expect(content).toContain("Vibe Annotations");
	});

	it("documents MCP Pointer", () => {
		expect(content).toContain("MCP Pointer");
	});
});
