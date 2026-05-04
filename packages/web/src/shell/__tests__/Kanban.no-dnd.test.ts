/**
 * L15 step9 (write-tests) — PROTECTED TEST: drag is gone from Kanban.tsx.
 *
 * Approved.md §7. Plan §1 + §6 task #12.
 *
 * Source-text guard: any reintroduction of the @dnd-kit imports or the
 * supporting helpers means drag-to-move has crept back into the Team
 * Board kanban. L15 explicitly forbids it.
 *
 * @lore L15 PROTECTED TEST: do not weaken or delete. Drag survives ONLY
 * on the Canvas (Shaped → Committed) per approved.md §1 + §7.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const Filename = fileURLToPath(import.meta.url);
const Dirname = dirname(Filename);
const KANBAN_PATH = resolve(Dirname, "..", "Kanban.tsx");

const FORBIDDEN_SYMBOLS = [
	"useDraggable",
	"useDroppable",
	"DndContext",
	"DragOverlay",
	"KeyboardSensor",
	"PointerSensor",
	"useSensors",
	"useSensor",
	"closestCenter",
	"@dnd-kit/core",
	"@dnd-kit/sortable",
	"COLUMN_TO_STATE",
	"resolveKanbanDrop",
];

describe("L15 — Kanban.tsx no longer wires @dnd-kit drag (PROTECTED)", () => {
	const src = readFileSync(KANBAN_PATH, "utf8");

	for (const symbol of FORBIDDEN_SYMBOLS) {
		it(`Kanban source must NOT mention "${symbol}"`, () => {
			expect(src).not.toContain(symbol);
		});
	}

	it("Kanban source must NOT export COLUMN_TO_STATE", () => {
		expect(src).not.toMatch(/export\s+(const|let|var)\s+COLUMN_TO_STATE\b/);
	});

	it("KanbanProps must NOT declare onMoveTask", () => {
		// Match either inside a `KanbanProps` interface block, or any
		// shape-style definition that names the prop.
		expect(src).not.toMatch(/onMoveTask\s*[:?]/);
	});
});

describe("L15 — WorkTeam.tsx no longer wires drag-move handlers (PROTECTED)", () => {
	const WORK_TEAM_PATH = resolve(Dirname, "..", "..", "pages", "WorkTeam.tsx");
	const src = readFileSync(WORK_TEAM_PATH, "utf8");

	it("WorkTeam.tsx must NOT define handleMoveTask", () => {
		expect(src).not.toMatch(/handleMoveTask\b/);
	});

	it("WorkTeam.tsx must NOT import COLUMN_TO_STATE", () => {
		expect(src).not.toMatch(/COLUMN_TO_STATE/);
	});
});
