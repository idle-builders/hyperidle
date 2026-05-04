/**
 * L15 — WorkTeam integration test for task request flow.
 *
 * Tests:
 * - Clicking a task card opens the TaskSheet with that task's title
 * - After a request is submitted, the sheet closes on success
 */
import { render, screen, waitFor } from "@testing-library/react";
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

const THREAD_ID = "thread-work-team-001";

describe("WorkTeam task request (L15)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fetchSpy = vi.fn();
		global.fetch = fetchSpy;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("clicking a task card opens the TaskSheet with that task's title", async () => {
		// Mock: GET threads returns empty (no existing thread), POST creates one
		fetchSpy
			.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ threads: [] }),
			});

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		renderPage();

		// Task "Implement login endpoint" is in the initial task list
		const taskTitle = "Implement login endpoint";
		await user.click(screen.getByText(taskTitle));

		// TaskSheet should open (role="dialog")
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		// Sheet should show the task title
		expect(screen.getAllByText(taskTitle).length).toBeGreaterThanOrEqual(1);
	});

	it("submitting a request through the sheet succeeds with mocked fetch", async () => {
		// Mock: GET threads returns empty, POST /api/threads creates thread,
		// POST /api/threads/:id/messages succeeds
		fetchSpy
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ threads: [] }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ thread: { id: THREAD_ID } }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ message: { id: "msg-001" } }),
			});

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		renderPage();

		// Open the sheet
		await user.click(screen.getByText("Implement login endpoint"));
		expect(screen.getByRole("dialog")).toBeInTheDocument();

		// Select an intent
		await user.click(screen.getByRole("radio", { name: /move to blocked/i }));

		// Submit
		await user.click(screen.getByRole("button", { name: /send request/i }));

		// Sent status appears
		await waitFor(() => {
			expect(screen.getByRole("status")).toHaveTextContent("Sent.");
		});

		// Sheet auto-closes after ~800ms
		vi.advanceTimersByTime(900);
		await waitFor(() => {
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		});
	});

	it("clicking a different task card opens sheet with that task's data", async () => {
		fetchSpy.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ threads: [] }),
		});

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		renderPage();

		// "Design signup form" is the second task in INITIAL_TASKS
		await user.click(screen.getByText("Design signup form"));

		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getAllByText("Design signup form").length).toBeGreaterThanOrEqual(1);
	});
});
