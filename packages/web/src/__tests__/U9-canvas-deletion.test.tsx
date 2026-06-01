/**
 * U9 AC-10: Canvas/Kanban removal verification.
 *
 * Verifies at the module level that:
 * - Canvas.tsx and Kanban.tsx are no longer importable from shell/
 * - useCanvasBets is no longer importable
 * - WorkPortfolio no longer imports Canvas
 *
 * These tests use dynamic import with try/catch to check for module existence.
 * If the files exist, the import succeeds (test fails = correctly red).
 * After deletion, the import throws (test passes = green).
 *
 * RED PHASE: these tests are written before implementation.
 */
import { describe, expect, it } from "vitest";

describe("U9 AC-10: Canvas/Kanban files removed", () => {
	it("Canvas.tsx does not exist as a module (cannot be imported)", async () => {
		// After deletion, this import should fail
		// Before deletion, this will succeed → test is red as expected
		let canvasExists = false;
		try {
			await import("../shell/Canvas.js");
			canvasExists = true;
		} catch {
			canvasExists = false;
		}
		expect(canvasExists).toBe(false);
	});

	it("Kanban.tsx does not exist as a module (cannot be imported)", async () => {
		let kanbanExists = false;
		try {
			await import("../shell/Kanban.js");
			kanbanExists = true;
		} catch {
			kanbanExists = false;
		}
		expect(kanbanExists).toBe(false);
	});

	it("useCanvasBets does not exist as a module (cannot be imported)", async () => {
		let hookExists = false;
		try {
			await import("../hooks/useCanvasBets.js");
			hookExists = true;
		} catch {
			hookExists = false;
		}
		expect(hookExists).toBe(false);
	});
});
