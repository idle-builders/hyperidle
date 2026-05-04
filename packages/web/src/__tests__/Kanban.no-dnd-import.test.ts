/**
 * L15 — source-string tripwire. `Kanban.tsx` must NOT import `@dnd-kit/core`
 * or call any `useDraggable` / `useDroppable` / `DndContext` / `KeyboardSensor`
 * / `PointerSensor` symbol. The Team Board kanban is read-only — drag
 * survives only on Canvas (Shaped → Committed). Source: `plans/L15-plan.md`
 * §9 Protected tests + AC-1c. This is the load-bearing CC-003 defence.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const Filename = fileURLToPath(import.meta.url);
const Dirname = dirname(Filename);
const KANBAN_SRC = readFileSync(join(Dirname, "..", "shell", "Kanban.tsx"), "utf8");

describe("L15 — Kanban.tsx contains no @dnd-kit references (AC-1c tripwire)", () => {
	it("does not import from '@dnd-kit/core'", () => {
		expect(KANBAN_SRC).not.toMatch(/@dnd-kit\/core/);
	});

	it("does not call useDraggable", () => {
		expect(KANBAN_SRC).not.toMatch(/useDraggable/);
	});

	it("does not call useDroppable", () => {
		expect(KANBAN_SRC).not.toMatch(/useDroppable/);
	});

	it("does not reference DndContext", () => {
		expect(KANBAN_SRC).not.toMatch(/DndContext/);
	});

	it("does not reference KeyboardSensor or PointerSensor", () => {
		expect(KANBAN_SRC).not.toMatch(/KeyboardSensor/);
		expect(KANBAN_SRC).not.toMatch(/PointerSensor/);
	});

	it("does not export resolveKanbanDrop or COLUMN_TO_STATE", () => {
		// Both symbols are deleted per plan §4.5. They are the artefacts of
		// the old drag contract; their disappearance is the AC-1 contract.
		expect(KANBAN_SRC).not.toMatch(/resolveKanbanDrop/);
		expect(KANBAN_SRC).not.toMatch(/COLUMN_TO_STATE/);
	});
});
