/**
 * L15 — WorkTeamTaskThread page (RED phase).
 *
 * Contract:
 *  - The page mounts at `/work/team/tasks/:taskId/thread`.
 *  - On mount, it issues `GET /api/threads?host_kind=task&host_id={taskId}`.
 *    - When a thread exists, it then fetches `GET /api/threads/{id}` and
 *      mounts <ThreadShell> with the response.
 *    - When no thread exists, it renders an EmptyState explaining the user
 *      must send a request to start the thread.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeamTaskThread } from "../pages/WorkTeamTaskThread";

interface FetchCall {
	url: string;
}

let fetchCalls: FetchCall[] = [];
let listResponse: { threads: Array<{ id: string }> };
let detailResponse: unknown;
let listStatus = 200;
let detailStatus = 200;

beforeEach(() => {
	fetchCalls = [];
	listResponse = { threads: [] };
	detailResponse = null;
	listStatus = 200;
	detailStatus = 200;

	vi.stubGlobal("fetch", async (input: string | URL): Promise<Response> => {
		const url = typeof input === "string" ? input : input.toString();
		fetchCalls.push({ url });
		if (url.startsWith("/api/threads?")) {
			return new Response(JSON.stringify(listResponse), {
				status: listStatus,
				headers: { "content-type": "application/json" },
			});
		}
		if (url.startsWith("/api/threads/")) {
			return new Response(JSON.stringify(detailResponse), {
				status: detailStatus,
				headers: { "content-type": "application/json" },
			});
		}
		return new Response("not found", { status: 404 });
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function renderAtTask(taskId: string): void {
	render(
		<MemoryRouter initialEntries={[`/work/team/tasks/${taskId}/thread`]}>
			<Routes>
				<Route path="/work/team/tasks/:taskId/thread" element={<WorkTeamTaskThread />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkTeamTaskThread", () => {
	it("mounts ThreadShell when a thread exists for the task", async () => {
		const now = new Date().toISOString();
		listResponse = { threads: [{ id: "thread-abc" }] };
		detailResponse = {
			thread: {
				id: "thread-abc",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "u-founder",
				participants: ["u-founder", "agent-dev-1"],
				pinned: false,
				resolvedAt: null,
				lastActiveAt: now,
				createdAt: now,
			},
			messages: [
				{
					id: "m-1",
					threadId: "thread-abc",
					senderId: "u-founder",
					type: "plain",
					payload: { text: "@A. Founder requested: Pause" },
					createdAt: now,
				},
			],
			headMessageId: "m-1",
			identities: { "u-founder": { name: "A. Founder" } },
		};

		renderAtTask("task-1");

		await waitFor(() => {
			expect(
				fetchCalls.some((c) => c.url.includes("/api/threads?") && c.url.includes("host_id=task-1")),
			).toBe(true);
		});
		await waitFor(() => {
			expect(fetchCalls.some((c) => c.url === "/api/threads/thread-abc")).toBe(true);
		});

		// The thread message body is rendered (ThreadShell mounted with detail).
		await waitFor(() => {
			expect(screen.getByText(/@A\. Founder requested: Pause/)).toBeInTheDocument();
		});
	});

	it("renders an EmptyState when no thread exists for the task", async () => {
		listResponse = { threads: [] };
		renderAtTask("task-orphan");

		await waitFor(() => {
			expect(
				fetchCalls.some(
					(c) => c.url.includes("/api/threads?") && c.url.includes("host_id=task-orphan"),
				),
			).toBe(true);
		});

		await waitFor(() => {
			expect(screen.getByText(/no thread yet/i)).toBeInTheDocument();
		});
	});
});
