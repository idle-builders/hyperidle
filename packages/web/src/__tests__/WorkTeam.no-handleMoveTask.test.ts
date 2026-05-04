/**
 * L15 — source-string tripwire for `WorkTeam.tsx`. The page no longer
 * carries a move-task callback; tasks are agent-team-owned and humans
 * interact via the request menu / open-thread affordance.
 *
 * Source: `plans/L15-plan.md` §4.6 + §9 protected tests.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const Filename = fileURLToPath(import.meta.url);
const Dirname = dirname(Filename);
const SRC = readFileSync(join(Dirname, "..", "pages", "WorkTeam.tsx"), "utf8");

describe("L15 — WorkTeam.tsx no longer carries the move-task plumbing", () => {
	it("does not declare a handleMoveTask callback", () => {
		expect(SRC).not.toMatch(/handleMoveTask/);
	});

	it("does not import COLUMN_TO_STATE or KanbanColumnState from Kanban", () => {
		expect(SRC).not.toMatch(/COLUMN_TO_STATE/);
		expect(SRC).not.toMatch(/KanbanColumnState/);
	});

	it("wires onSubmitTaskRequest and onOpenTaskThread to <Kanban>", () => {
		// AC-2 + AC-4: the new affordance handlers are the read-after-write
		// proof that drag was replaced rather than just deleted.
		expect(SRC).toMatch(/onSubmitTaskRequest/);
		expect(SRC).toMatch(/onOpenTaskThread/);
	});
});
