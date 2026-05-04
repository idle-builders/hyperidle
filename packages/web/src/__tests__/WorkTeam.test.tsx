/**
 * WorkTeam page tests — post-L15.
 *
 * Source: docs/work-packages/L15-plan.md §4.2 + §12 (WorkTeam.test.tsx row).
 *
 * Mutations vs pre-L15:
 *  - REMOVED: the `COLUMN_TO_STATE` exported-map test case (drag is gone).
 *  - NEW: clicking a verb in the TaskActionsMenu posts to /api/tasks/:id/request.
 *  - NEW: source-grep — handleMoveTask is no longer present in WorkTeam.tsx.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkTeam />
		</MemoryRouter>,
	);
}

describe("WorkTeam — render", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
	});

	it("renders Team Board heading", () => {
		renderPage();
		expect(screen.getByText("Team Board")).toBeInTheDocument();
	});

	it("renders kanban columns", () => {
		renderPage();
		expect(screen.getByText("Planned")).toBeInTheDocument();
		expect(screen.getByText("Blocked")).toBeInTheDocument();
		expect(screen.getByText("In Progress")).toBeInTheDocument();
		expect(screen.getByText("Done")).toBeInTheDocument();
	});

	it("renders task cards", () => {
		renderPage();
		expect(screen.getByText("Implement login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Design signup form")).toBeInTheDocument();
	});

	it("composes Canvas (top) and Kanban (bottom) in DOM order", () => {
		renderPage();
		const canvas = screen.getByTestId("work-team-canvas");
		const kanban = screen.getByTestId("work-team-kanban");
		const order = canvas.compareDocumentPosition(kanban);
		expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});

describe("WorkTeam — pitch selector", () => {
	it("opens pitch selector when button clicked", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByText("Select Pitches"));
		expect(screen.getByText("Select Pitch")).toBeInTheDocument();
	});

	it("closes pitch selector via close button", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByText("Select Pitches"));
		await user.click(screen.getByLabelText("Close pitch selector"));
		expect(screen.queryByText("Select Pitch")).not.toBeInTheDocument();
	});
});

describe("WorkTeam — L15 task actions menu wiring", () => {
	const fetchSpy = vi.fn(async () =>
		new Response(JSON.stringify({ message: { id: "m1" }, thread: { id: "th1" } }), {
			status: 201,
			headers: { "content-type": "application/json" },
		}),
	);

	beforeEach(() => {
		fetchSpy.mockClear();
		vi.stubGlobal("fetch", fetchSpy);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("clicking a verb in the menu issues a POST to /api/tasks/:id/request", async () => {
		const user = userEvent.setup();
		renderPage();
		// @test-issue: the test originally pinned `triggers[0]` to a card in
		// the in_progress column (where "Request stop" is legal). The Kanban
		// renders columns in [planned, blocked, in_progress, done] order, so
		// `triggers[0]` is on a `planned` card whose verb set does NOT include
		// `request_stop`. To exercise the wiring without changing assertions,
		// we click the first trigger that yields a "Request stop" menu item.
		const triggers = screen.getAllByRole("button", { name: /actions|···|⋯/i });
		expect(triggers.length).toBeGreaterThan(0);
		let stop: HTMLElement | null = null;
		for (const t of triggers) {
			await user.click(t);
			stop = screen.queryByText("Request stop");
			if (stop) break;
			await user.click(t);
		}
		expect(stop).not.toBeNull();
		await user.click(stop as HTMLElement);

		expect(fetchSpy).toHaveBeenCalled();
		const url = fetchSpy.mock.calls[0][0] as string;
		expect(url).toMatch(/\/api\/tasks\/.+\/request/);
	});
});

describe("WorkTeam — source invariants (post-L15)", () => {
	it("WorkTeam.tsx no longer references handleMoveTask", () => {
		const filename = fileURLToPath(import.meta.url);
		const dir = dirname(filename);
		const src = readFileSync(join(dir, "..", "pages", "WorkTeam.tsx"), "utf8");
		expect(src).not.toMatch(/\bhandleMoveTask\b/);
		// COLUMN_TO_STATE import is gone too (no drag → no mapping).
		expect(src).not.toMatch(/\bCOLUMN_TO_STATE\b/);
	});
});
