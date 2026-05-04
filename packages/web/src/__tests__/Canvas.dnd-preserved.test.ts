/**
 * L15 AC-3 regression guard. The story carves out Canvas's Shaped → Committed
 * drag explicitly. If a future agent over-corrects and rips dnd-kit out of
 * Canvas too, this tripwire fails BEFORE the (slow, browser-bound) Canvas
 * keyboard-drag Playwright suite catches it.
 *
 * This is the asymmetry stated in `plans/L15-plan.md` §11 (spec-line 520):
 * drag stays on Canvas, vanishes from Kanban. Inverse of
 * `Kanban.no-dnd-import.test.ts` — both directions of the asymmetry pinned.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const Filename = fileURLToPath(import.meta.url);
const Dirname = dirname(Filename);
const CANVAS_SRC = readFileSync(join(Dirname, "..", "shell", "Canvas.tsx"), "utf8");

describe("L15 AC-3 — Canvas.tsx still uses @dnd-kit (Shape Up Shaped → Committed drag)", () => {
	it("imports from '@dnd-kit/core'", () => {
		expect(CANVAS_SRC).toMatch(/@dnd-kit\/core/);
	});

	it("uses useDraggable + useDroppable + DndContext", () => {
		expect(CANVAS_SRC).toMatch(/useDraggable/);
		expect(CANVAS_SRC).toMatch(/useDroppable/);
		expect(CANVAS_SRC).toMatch(/DndContext/);
	});

	it("retains KeyboardSensor (a11y)", () => {
		expect(CANVAS_SRC).toMatch(/KeyboardSensor/);
	});
});
