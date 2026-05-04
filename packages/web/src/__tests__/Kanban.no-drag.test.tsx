/**
 * L15 — Kanban no-drag invariants (V-1a / V-1b / V-1c).
 *
 * Source: L15-plan.md § 12 protected row `Kanban.no-drag.test.tsx`. Replaces
 * `Kanban.keyboard-drag.test.tsx` whose assertions are now obsolete.
 *
 * Red phase: Kanban.tsx still imports the dnd-kit symbols and renders
 * `[data-droppable-column]` markers per its current shape. Once /write-code
 * strips drag (§ 4.1 of the plan), these assertions go green.
 *
 * Companion: the Canvas Shaped→Committed drag MUST survive — that part of
 * the contract is verified at the bottom of this file via a source-grep on
 * `Canvas.tsx` (still imports DndContext) and the existing `Canvas.test.tsx`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

const Filename = fileURLToPath(import.meta.url);
const Dirname = dirname(Filename);
const KanbanSource = readFileSync(join(Dirname, "..", "shell", "Kanban.tsx"), "utf8");
const CanvasSource = readFileSync(join(Dirname, "..", "shell", "Canvas.tsx"), "utf8");

const tasks: KanbanTask[] = [
	{ id: "t1", title: "A", owner: "agent-1", state: "in_progress" },
	{ id: "t2", title: "B", owner: "agent-2", state: "blocked" },
];

// In red phase Kanban still requires `onMoveTask`. Once L15 § 4.1 lands the
// prop is gone. Both signatures pass through — the test asserts on RENDERED
// DOM and SOURCE TEXT.
function renderKanban(): ReturnType<typeof render> {
	const props = { tasks } as unknown as Parameters<typeof Kanban>[0];
	return render(<Kanban {...props} />);
}

describe("Kanban — drag is removed (L15 § 4.1)", () => {
	it("V-1a: renders no [data-droppable-column] markers", () => {
		const { container } = renderKanban();
		const droppables = container.querySelectorAll("[data-droppable-column]");
		expect(droppables.length).toBe(0);
	});

	it("V-1a: no rendered task element carries aria-roledescription='draggable'", () => {
		const { container } = renderKanban();
		const draggables = container.querySelectorAll('[aria-roledescription="draggable"]');
		expect(draggables.length).toBe(0);
	});

	it("V-1a: no rendered task element carries [role='button'][aria-pressed]", () => {
		const { container } = renderKanban();
		const pressed = container.querySelectorAll('[role="button"][aria-pressed]');
		expect(pressed.length).toBe(0);
	});

	it("V-1b: Kanban.tsx source does NOT import DndContext from @dnd-kit/core", () => {
		expect(KanbanSource).not.toMatch(/from\s+["']@dnd-kit\/core["']/);
	});

	it("V-1b: Kanban.tsx source does NOT import useDraggable", () => {
		expect(KanbanSource).not.toMatch(/useDraggable/);
	});

	it("V-1b: Kanban.tsx source does NOT import useDroppable", () => {
		expect(KanbanSource).not.toMatch(/useDroppable/);
	});

	it("V-1b: Kanban.tsx source does NOT import DragOverlay", () => {
		expect(KanbanSource).not.toMatch(/DragOverlay/);
	});

	it("V-1b: Kanban.tsx source does NOT import KeyboardSensor or PointerSensor", () => {
		expect(KanbanSource).not.toMatch(/KeyboardSensor/);
		expect(KanbanSource).not.toMatch(/PointerSensor/);
	});

	it("V-1c: COLUMN_TO_STATE is no longer exported from Kanban.tsx", () => {
		// Source-grep: the previous export was on a top-level
		// `export const COLUMN_TO_STATE = ...`. After L15 § 4.1 strips the
		// move handler the inverse map has no consumers and must be removed.
		expect(KanbanSource).not.toMatch(/export\s+const\s+COLUMN_TO_STATE\b/);
	});
});

describe("Canvas — drag SURVIVES between Shaped → Committed (L15 § 4.4 / AC-3)", () => {
	it("Canvas.tsx still imports DndContext from @dnd-kit/core", () => {
		expect(CanvasSource).toMatch(/from\s+["']@dnd-kit\/core["']/);
		expect(CanvasSource).toMatch(/DndContext/);
	});

	it("Canvas.tsx still uses sensor configuration (KeyboardSensor + PointerSensor)", () => {
		expect(CanvasSource).toMatch(/KeyboardSensor/);
		expect(CanvasSource).toMatch(/PointerSensor/);
	});
});
