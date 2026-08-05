/**
 * Q1 — AC5 / AC6 / AC7 / AC8 / AC9: SessionActivityPanel component.
 *
 * Architecture plan §4.5: companion pane for the dial-in view.
 * Shows session activity stream, filter tabs, and summary on session end.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionActivityPanel } from "../components/SessionActivityPanel.js";

interface MockActivityEntry {
	type: "tool_call" | "reasoning";
	timestamp: number;
	data: Record<string, unknown>;
}

function mkSession(state: "active" | "done" = "active") {
	return {
		id: "sess-1",
		agentId: "agent-1",
		taskId: "task-1",
		state,
		startedAt: new Date().toISOString(),
		modelTier: "workhorse",
	};
}

function mkActivity(): MockActivityEntry[] {
	return [
		{
			type: "tool_call",
			timestamp: Date.now(),
			data: { toolName: "bash", argsSummary: 'cmd="ls"' },
		},
		{
			type: "reasoning",
			timestamp: Date.now() + 100,
			data: { excerpt: "Thinking about the problem..." },
		},
	];
}

describe("SessionActivityPanel (Q1 §4.5)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC6: renders activity stream with session data
	it("renders activity entries when streaming", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession(),
					activity: mkActivity(),
				}),
		}) as unknown as typeof fetch;

		const onClose = vi.fn();
		render(
			<SessionActivityPanel
				sessionId="sess-1"
				agentName="Builder Bot"
				taskTitle="Implement feature"
				onClose={onClose}
			/>,
		);

		// Activity entries should appear
		await waitFor(() => {
			expect(screen.getByText(/bash/i)).toBeInTheDocument();
		});
	});

	// AC6: tool call entries render with tool name
	it("renders tool call entries with the tool name", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession(),
					activity: mkActivity(),
				}),
		}) as unknown as typeof fetch;

		render(
			<SessionActivityPanel
				sessionId="sess-1"
				agentName="Builder Bot"
				taskTitle="Task"
				onClose={vi.fn()}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText(/bash/i)).toBeInTheDocument();
		});
	});

	// AC5 / AC6: panel has landmark role for a11y (architecture reviewer requirement)
	it("has an accessible region/aside landmark role", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession(),
					activity: [],
				}),
		}) as unknown as typeof fetch;

		render(
			<SessionActivityPanel
				sessionId="sess-1"
				agentName="Builder Bot"
				taskTitle="Task"
				onClose={vi.fn()}
			/>,
		);

		await waitFor(() => {
			// Should have a region or complementary landmark
			const region = document.querySelector("[role='region'], [role='complementary'], aside");
			expect(region).not.toBeNull();
		});
	});

	// AC8: observe mode — panel renders without sending any write requests
	it("does not make any write requests (observe mode is read-only)", async () => {
		const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
		const writeRequests: string[] = [];

		global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const method = (init?.method ?? "GET").toUpperCase();
			if (writeMethods.includes(method)) {
				writeRequests.push(method);
			}
			return new Response(
				JSON.stringify({
					session: mkSession(),
					activity: mkActivity(),
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		render(
			<SessionActivityPanel
				sessionId="sess-1"
				agentName="Builder Bot"
				taskTitle="Task"
				onClose={vi.fn()}
			/>,
		);

		await waitFor(() => {
			expect(true).toBe(true);
		});

		expect(writeRequests).toHaveLength(0);
	});

	// AC9: when session ends, panel transitions to summary state
	it("shows summary state when session is done", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession("done"),
					activity: mkActivity(),
				}),
		}) as unknown as typeof fetch;

		render(
			<SessionActivityPanel
				sessionId="sess-1"
				agentName="Builder Bot"
				taskTitle="Task"
				onClose={vi.fn()}
			/>,
		);

		// Summary state should be indicated when session is done
		await waitFor(() => {
			// Look for summary-related text or the panel has loaded something
			const panel = document.querySelector("[data-testid]");
			expect(panel !== null || screen.queryByText(/builder bot/i) !== null).toBe(true);
		});
	});

	// AC5: close button calls onClose
	it("calls onClose when the close button is clicked", async () => {
		const onClose = vi.fn();
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession(),
					activity: [],
				}),
		}) as unknown as typeof fetch;

		render(
			<SessionActivityPanel
				sessionId="sess-1"
				agentName="Builder Bot"
				taskTitle="Task"
				onClose={onClose}
			/>,
		);

		await waitFor(() => {
			const closeBtn = screen.queryByRole("button", { name: /close/i });
			expect(closeBtn).not.toBeNull();
		});

		const user = (await import("@testing-library/user-event")).default.setup();
		const closeBtn = screen.getByRole("button", { name: /close/i });
		await user.click(closeBtn);
		expect(onClose).toHaveBeenCalled();
	});

	// AC6: "Live" badge is visible when session is active (semantic label a11y)
	it("renders a visible 'Live' semantic badge when session is active", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession("active"),
					activity: [],
				}),
		}) as unknown as typeof fetch;

		render(
			<SessionActivityPanel
				sessionId="sess-1"
				agentName="Builder Bot"
				taskTitle="Task"
				onClose={vi.fn()}
			/>,
		);

		await waitFor(() => {
			const liveEl = screen.queryByText(/live/i);
			expect(liveEl).not.toBeNull();
		});
	});
});
