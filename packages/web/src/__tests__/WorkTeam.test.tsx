import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkTeam />
		</MemoryRouter>,
	);
}

describe("WorkTeam", () => {
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

	it("renders task cards in the kanban", () => {
		renderPage();
		expect(screen.getByText("Implement login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Design signup form")).toBeInTheDocument();
	});

	it("opens pitch selector when button clicked", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByText("Select Pitches"));

		expect(screen.getByText("Select Pitch")).toBeInTheDocument();
		expect(screen.getByText("Mobile responsive layout")).toBeInTheDocument();
	});

	it("closes pitch selector when close button clicked", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByText("Select Pitches"));
		expect(screen.getByText("Select Pitch")).toBeInTheDocument();

		await user.click(screen.getByLabelText("Close pitch selector"));
		expect(screen.queryByText("Select Pitch")).not.toBeInTheDocument();
	});

	it("composes Canvas (top) and Kanban (bottom) in DOM order", () => {
		renderPage();
		const canvas = screen.getByTestId("work-team-canvas");
		const kanban = screen.getByTestId("work-team-kanban");
		expect(canvas).toBeInTheDocument();
		expect(kanban).toBeInTheDocument();
		const order = canvas.compareDocumentPosition(kanban);
		expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	// L15: WorkTeam.tsx no longer imports COLUMN_TO_STATE / handleMoveTask is gone.
	it("L15: source no longer imports COLUMN_TO_STATE", () => {
		const Filename = fileURLToPath(import.meta.url);
		const Dirname = dirname(Filename);
		const src = readFileSync(join(Dirname, "..", "pages", "WorkTeam.tsx"), "utf8");
		// The @lore comment is allowed to mention the removed export.
		// Block actual usages (import / member-access).
		expect(src).not.toMatch(/import[^;]*COLUMN_TO_STATE/);
		expect(src).not.toMatch(/COLUMN_TO_STATE\[/);
	});

	it("L15: source no longer defines handleMoveTask (drag-driven move handler)", () => {
		const Filename = fileURLToPath(import.meta.url);
		const Dirname = dirname(Filename);
		const src = readFileSync(join(Dirname, "..", "pages", "WorkTeam.tsx"), "utf8");
		// Allow the @lore comment to mention the removed handler; only the
		// definition (`const handleMoveTask` / `function handleMoveTask`)
		// must be gone. Use the strict definition pattern.
		expect(src).not.toMatch(/(?:const|function)\s+handleMoveTask\b/);
	});

	it("L15: renders a TaskActionsMenu trigger for each task", () => {
		renderPage();
		// Initial fixture has 5 tasks (t1..t5). Each card mounts a kebab
		// trigger labelled "Actions for <title>".
		expect(screen.getByLabelText("Actions for Implement login endpoint")).toBeInTheDocument();
		expect(screen.getByLabelText("Actions for Design signup form")).toBeInTheDocument();
		expect(screen.getByLabelText("Actions for JWT refresh logic")).toBeInTheDocument();
		expect(screen.getByLabelText("Actions for Write auth tests")).toBeInTheDocument();
		expect(screen.getByLabelText("Actions for Rate limit middleware")).toBeInTheDocument();
	});
});
