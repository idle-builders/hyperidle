/**
 * U9 AC-10: Canvas/Kanban removal verification.
 *
 * Verifies at the filesystem level that Canvas.tsx, Kanban.tsx, and
 * useCanvasBets.ts have been deleted. Uses existsSync — no dynamic import
 * needed (and avoids Vite's compile-time import resolution that would error
 * on the test file itself).
 *
 * RED PHASE: these tests are written before implementation.
 * GREEN PHASE: tests pass once files are deleted.
 *
 * @lore U9: Dynamic import was tried but Vite's import analysis runs before
 * the test body executes, causing the test *file* to fail to load. Filesystem
 * check is the correct approach for "file must not exist" assertions.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SHELL_DIR = path.resolve(__dirname, "../shell");
const HOOKS_DIR = path.resolve(__dirname, "../hooks");

describe("U9 AC-10: Canvas/Kanban files removed", () => {
	it("Canvas.tsx does not exist in shell/", () => {
		expect(existsSync(path.join(SHELL_DIR, "Canvas.tsx"))).toBe(false);
	});

	it("Canvas.stories.tsx does not exist in shell/", () => {
		expect(existsSync(path.join(SHELL_DIR, "Canvas.stories.tsx"))).toBe(false);
	});

	it("Kanban.tsx does not exist in shell/", () => {
		expect(existsSync(path.join(SHELL_DIR, "Kanban.tsx"))).toBe(false);
	});

	it("Kanban.stories.tsx does not exist in shell/", () => {
		expect(existsSync(path.join(SHELL_DIR, "Kanban.stories.tsx"))).toBe(false);
	});

	it("useCanvasBets.ts does not exist in hooks/", () => {
		expect(existsSync(path.join(HOOKS_DIR, "useCanvasBets.ts"))).toBe(false);
	});

	it("useCanvasBets.test.ts does not exist in hooks/__tests__/", () => {
		expect(existsSync(path.join(HOOKS_DIR, "__tests__", "useCanvasBets.test.ts"))).toBe(false);
	});
});
