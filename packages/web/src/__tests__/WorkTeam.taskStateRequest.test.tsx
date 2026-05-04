/**
 * L15: WorkTeam wires the kebab menu to the threads API and renders a toast.
 * Locks: no optimistic UI (card stays put), correct POST shape, refs link
 * to task, success/error toast, focus on error.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

function LocationProbe(): JSX.Element {
	const location = useLocation();
	return <div data-testid="location-probe">{location.pathname}</div>;
}

interface FetchCall {
	url: string;
	method: string;
	body?: unknown;
}

function installFetchMock(
	handler: (call: FetchCall) => Response | Promise<Response>,
): { calls: FetchCall[] } {
	const calls: FetchCall[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const method = init?.method ?? "GET";
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		const call = { url, method, body };
		calls.push(call);
		return handler(call);
	});
	global.fetch = fetchMock as unknown as typeof fetch;
	return { calls };
}

function renderPage(): void {
	render(
		<MemoryRouter>
			<Routes>
				<Route path="/" element={<WorkTeam />} />
				<Route
					path="/work/team/task/:taskId/thread"
					element={<LocationProbe />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("L15 WorkTeam — task state request", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = global.fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	async function openSubmenuForTask(taskTitle: string): Promise<void> {
		const user = userEvent.setup();
		const taskCard = screen.getByText(taskTitle).closest("[data-ds-component='TaskCard']");
		expect(taskCard).not.toBeNull();
		const kebab = taskCard?.querySelector(
			"[aria-label='Task actions'], [aria-label*='actions']",
		) as HTMLElement | null;
		expect(kebab).not.toBeNull();
		if (kebab) await user.click(kebab);
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
	}

	it("selecting Blocked posts a plain message with the canonical text + refs", async () => {
		const { calls } = installFetchMock(({ url, method }) => {
			if (url.includes("/api/threads") && method === "GET") {
				return new Response(
					JSON.stringify({ threads: [{ id: "thread-1", lastActiveAt: 1 }] }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.endsWith("/api/threads/thread-1/messages") && method === "POST") {
				return new Response(
					JSON.stringify({ message: { id: "m1" }, thread: { id: "thread-1" } }),
					{ status: 201, headers: { "content-type": "application/json" } },
				);
			}
			return new Response("not found", { status: 404 });
		});

		const user = userEvent.setup();
		renderPage();
		await openSubmenuForTask("Implement login endpoint");
		await user.click(screen.getByRole("menuitem", { name: /^blocked$/i }));

		await waitFor(() => {
			const post = calls.find(
				(c) => c.method === "POST" && c.url.endsWith("/api/threads/thread-1/messages"),
			);
			expect(post).toBeDefined();
		});
		const post = calls.find(
			(c) => c.method === "POST" && c.url.endsWith("/api/threads/thread-1/messages"),
		);
		expect(post?.body).toMatchObject({
			type: "plain",
			payload: {
				text: "Requested state change: In Progress → Blocked",
				refs: [{ kind: "task", id: "t1" }],
			},
		});
		expect((post?.body as { clientKey: string }).clientKey).toMatch(
			/^state-req:t1:blocked:/,
		);
	});

	it("the task card stays in its current column after a successful state-request POST", async () => {
		installFetchMock(({ url, method }) => {
			if (url.includes("/api/threads") && method === "GET") {
				return new Response(
					JSON.stringify({ threads: [{ id: "thread-1", lastActiveAt: 1 }] }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.endsWith("/api/threads/thread-1/messages") && method === "POST") {
				return new Response(
					JSON.stringify({ message: { id: "m1" }, thread: { id: "thread-1" } }),
					{ status: 201, headers: { "content-type": "application/json" } },
				);
			}
			return new Response("nf", { status: 404 });
		});

		const user = userEvent.setup();
		renderPage();
		// "Implement login endpoint" starts as in_progress.
		const initialCard = screen.getByText("Implement login endpoint").closest(
			"[data-ds-component='TaskCard']",
		);
		const initialColumn = initialCard?.closest(".flex.flex-col");
		expect(initialColumn?.textContent).toMatch(/In Progress/i);

		await openSubmenuForTask("Implement login endpoint");
		await user.click(screen.getByRole("menuitem", { name: /^blocked$/i }));

		await waitFor(() => {
			expect(screen.getByText(/posted to thread/i)).toBeInTheDocument();
		});
		// Card is still under In Progress, not Blocked.
		const afterCard = screen.getByText("Implement login endpoint").closest(
			"[data-ds-component='TaskCard']",
		);
		const afterColumn = afterCard?.closest(".flex.flex-col");
		expect(afterColumn?.textContent).toMatch(/In Progress/i);
	});

	it("renders a success toast after a successful request", async () => {
		installFetchMock(({ url, method }) => {
			if (url.includes("/api/threads") && method === "GET") {
				return new Response(
					JSON.stringify({ threads: [{ id: "thread-1", lastActiveAt: 1 }] }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.endsWith("/api/threads/thread-1/messages") && method === "POST") {
				return new Response(
					JSON.stringify({ message: { id: "m1" }, thread: { id: "thread-1" } }),
					{ status: 201, headers: { "content-type": "application/json" } },
				);
			}
			return new Response("nf", { status: 404 });
		});

		const user = userEvent.setup();
		renderPage();
		await openSubmenuForTask("Implement login endpoint");
		await user.click(screen.getByRole("menuitem", { name: /^blocked$/i }));
		await waitFor(() => {
			expect(screen.getByText(/Requested → Blocked\. Posted to thread\./i)).toBeInTheDocument();
		});
	});

	it("renders an error toast and re-opens the menu when POST fails with network error", async () => {
		installFetchMock(({ url, method }) => {
			if (url.includes("/api/threads") && method === "GET") {
				return new Response(
					JSON.stringify({ threads: [{ id: "thread-1", lastActiveAt: 1 }] }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.endsWith("/api/threads/thread-1/messages") && method === "POST") {
				throw new TypeError("offline");
			}
			return new Response("nf", { status: 404 });
		});

		const user = userEvent.setup();
		renderPage();
		await openSubmenuForTask("Implement login endpoint");
		await user.click(screen.getByRole("menuitem", { name: /^blocked$/i }));
		await waitFor(() => {
			expect(screen.getByText(/Couldn't post request\. Retry\./i)).toBeInTheDocument();
		});
		// Submenu re-opens — Blocked menuitem is in the DOM again.
		expect(screen.getByRole("menuitem", { name: /^blocked$/i })).toBeInTheDocument();
	});

	it("clicking Open thread navigates to /work/team/task/:taskId/thread", async () => {
		installFetchMock(() =>
			new Response(JSON.stringify({ threads: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		const user = userEvent.setup();
		renderPage();
		const taskCard = screen
			.getByText("Implement login endpoint")
			.closest("[data-ds-component='TaskCard']");
		const kebab = taskCard?.querySelector(
			"[aria-label='Task actions'], [aria-label*='actions']",
		) as HTMLElement | null;
		if (kebab) await user.click(kebab);
		await user.click(screen.getByRole("menuitem", { name: /open thread/i }));
		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/work/team/task/t1/thread",
			);
		});
	});

	it("rapid double-click on Blocked sends exactly one POST (inFlight guard)", async () => {
		// @lore L15 (adversary CRITICAL): the menu must disable items while
		// the request is in flight. Server-side clientKey idempotency is a
		// separate defense — but the user-side guard must prevent the second
		// POST from leaving the browser at all.
		let resolvePost!: (resp: Response) => void;
		const { calls } = installFetchMock(({ url, method }) => {
			if (url.includes("/api/threads") && method === "GET") {
				return new Response(
					JSON.stringify({ threads: [{ id: "thread-1", lastActiveAt: 1 }] }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.endsWith("/api/threads/thread-1/messages") && method === "POST") {
				return new Promise<Response>((r) => {
					resolvePost = r;
				});
			}
			return new Response("nf", { status: 404 });
		});
		const user = userEvent.setup();
		renderPage();
		await openSubmenuForTask("Implement login endpoint");
		const blocked = screen.getByRole("menuitem", { name: /^blocked$/i });
		// First click — submenu closes, request is in flight.
		await user.click(blocked);
		// User attempts to retry by clicking the kebab again before resolution.
		const taskCard = screen
			.getByText("Implement login endpoint")
			.closest("[data-ds-component='TaskCard']");
		const kebab = taskCard?.querySelector(
			"[aria-label='Task actions']",
		) as HTMLElement | null;
		if (kebab) await user.click(kebab);
		// Resolve the in-flight POST — exactly one must have been issued.
		resolvePost(
			new Response(
				JSON.stringify({ message: { id: "m1" }, thread: { id: "thread-1" } }),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);
		await waitFor(() => {
			expect(screen.getByText(/posted to thread/i)).toBeInTheDocument();
		});
		const posts = calls.filter(
			(c) => c.method === "POST" && c.url.endsWith("/api/threads/thread-1/messages"),
		);
		expect(posts).toHaveLength(1);
	});
});
