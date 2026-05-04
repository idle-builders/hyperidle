/**
 * L15: WorkTeamTaskThread placeholder page. Locks the route + lazy-create
 * behavior. L18 may replace the body but the route + filename stay.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeamTaskThread } from "../pages/WorkTeamTaskThread";

interface FetchCall {
	url: string;
	method: string;
	body?: unknown;
}

function installFetchMock(
	handler: (call: FetchCall) => Response | Promise<Response>,
): { calls: FetchCall[] } {
	const calls: FetchCall[] = [];
	global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const method = init?.method ?? "GET";
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		const call = { url, method, body };
		calls.push(call);
		return handler(call);
	}) as unknown as typeof fetch;
	return { calls };
}

function renderAt(taskId: string): void {
	render(
		<MemoryRouter initialEntries={[`/work/team/task/${taskId}/thread`]}>
			<Routes>
				<Route path="/work/team/task/:taskId/thread" element={<WorkTeamTaskThread />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("L15 WorkTeamTaskThread placeholder page", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = global.fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("renders the thread when one exists for the task", async () => {
		installFetchMock(({ url, method }) => {
			if (url.includes("/api/threads") && url.includes("host_kind=task") && method === "GET") {
				return new Response(
					JSON.stringify({
						threads: [{ id: "thread-existing", lastActiveAt: 100, title: "Task t1" }],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.endsWith("/api/threads/thread-existing") && method === "GET") {
				return new Response(
					JSON.stringify({
						thread: {
							id: "thread-existing",
							hostKind: "task",
							hostId: "t1",
							title: "Task t1",
							messages: [],
							participants: [],
						},
						messages: [],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			return new Response("nf", { status: 404 });
		});

		renderAt("t1");
		await waitFor(() => {
			expect(screen.getByTestId("work-team-task-thread")).toBeInTheDocument();
		});
	});

	it("creates a thread on mount when none exists (POST /api/threads with host_kind=task)", async () => {
		const { calls } = installFetchMock(({ url, method }) => {
			if (url.includes("/api/threads") && url.includes("host_kind=task") && method === "GET") {
				return new Response(JSON.stringify({ threads: [] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url.endsWith("/api/threads") && method === "POST") {
				return new Response(
					JSON.stringify({
						thread: {
							id: "thread-new",
							hostKind: "task",
							hostId: "t1",
							messages: [],
							participants: [],
						},
					}),
					{ status: 201, headers: { "content-type": "application/json" } },
				);
			}
			if (url.endsWith("/api/threads/thread-new") && method === "GET") {
				return new Response(
					JSON.stringify({
						thread: {
							id: "thread-new",
							hostKind: "task",
							hostId: "t1",
							messages: [],
							participants: [],
						},
						messages: [],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			return new Response("nf", { status: 404 });
		});

		renderAt("t1");
		await waitFor(() => {
			const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/threads"));
			expect(post).toBeDefined();
			expect(post?.body).toMatchObject({ hostKind: "task", hostId: "t1" });
		});
	});
});
