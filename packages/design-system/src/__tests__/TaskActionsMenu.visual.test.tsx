// @vitest-environment jsdom
/**
 * L15 — TaskActionsMenu visual-regression contract.
 *
 * Source: docs/work-packages/L15-plan.md §12 W-4 row.
 *
 * Pin the existence of TaskActionsMenu.html with sections per state
 * (accepted, in_progress, blocked, review) + a pending variant. Pixel-diff
 * runs in the Playwright harness.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TaskActionsMenu — visual parity", () => {
	it("TaskActionsMenu.html exists in packages/design-system/html/", () => {
		const htmlPath = resolve(
			import.meta.dirname,
			"..",
			"..",
			"html",
			"TaskActionsMenu.html",
		);
		expect(existsSync(htmlPath)).toBe(true);
	});

	it("TaskActionsMenu.html contains sections for each state-conditional variant", () => {
		const html = readFileSync(
			resolve(import.meta.dirname, "..", "..", "html", "TaskActionsMenu.html"),
			"utf8",
		);
		for (const state of ["accepted", "in_progress", "blocked", "review", "pending"]) {
			expect(html.toLowerCase()).toContain(state);
		}
	});

	it("TaskActionsMenu.tsx exists at packages/design-system/src/", () => {
		expect(
			existsSync(resolve(import.meta.dirname, "..", "TaskActionsMenu.tsx")),
		).toBe(true);
	});

	it("TaskActionsMenu.stories.tsx exists at packages/design-system/src/", () => {
		expect(
			existsSync(resolve(import.meta.dirname, "..", "TaskActionsMenu.stories.tsx")),
		).toBe(true);
	});
});
