import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

// L15: WorkTeam fetches per-task thread metadata on mount; mock fetch so the
// page renders deterministically.
beforeEach(() => {
	vi.stubGlobal("fetch", async (input: string | URL): Promise<Response> => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.startsWith("/api/threads?")) {
			return new Response(JSON.stringify({ threads: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		return new Response("not found", { status: 404 });
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

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
		// I4 P2: WorkTeam must show Canvas above the Kanban board.
		renderPage();
		const canvas = screen.getByTestId("work-team-canvas");
		const kanban = screen.getByTestId("work-team-kanban");
		expect(canvas).toBeInTheDocument();
		expect(kanban).toBeInTheDocument();
		const order = canvas.compareDocumentPosition(kanban);
		// Node.DOCUMENT_POSITION_FOLLOWING === 4 → kanban follows canvas
		expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	// L15: COLUMN_TO_STATE map and handleMoveTask handler are deleted.
	it("does NOT export COLUMN_TO_STATE from the Kanban shell (L15 — drag deleted)", async () => {
		const mod = (await import("../shell/Kanban")) as Record<string, unknown>;
		expect(mod.COLUMN_TO_STATE).toBeUndefined();
	});

	// L15 AC2: every requestable task gains a Request ▾ affordance.
	it("renders a Request ▾ trigger on the in_progress fixture task (L15)", async () => {
		renderPage();
		await waitFor(() => {
			// The fixture's "Implement login endpoint" is in_progress; its card
			// must expose a Request trigger.
			const triggers = screen.getAllByRole("button", { name: /request/i });
			expect(triggers.length).toBeGreaterThan(0);
		});
	});

	// L15: WorkTeam should issue per-task thread-list fetches at mount.
	it("issues GET /api/threads?host_kind=task on mount (per visible task)", async () => {
		const calls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL): Promise<Response> => {
			const url = typeof input === "string" ? input : input.toString();
			calls.push(url);
			return new Response(JSON.stringify({ threads: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});
		renderPage();
		await waitFor(() => {
			expect(
				calls.filter((u) => u.includes("/api/threads?") && u.includes("host_kind=task")).length,
			).toBeGreaterThan(0);
		});
	});
});
