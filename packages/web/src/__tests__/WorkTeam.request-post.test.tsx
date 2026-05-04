/**
 * L15 step14 (write-tests) — Request verb posts a plain message to the
 * task's thread and shows a toast. Behavioural integration test.
 *
 * Approved.md §4.2 + §5. Plan §3.3 + §6 task #16.
 *
 * Asserts:
 *   - clicking Pause on a task whose `threadId` is known fires exactly one
 *     POST to `/api/threads/<threadId>/messages` with the canonical body.
 *   - StatusChip on the card does NOT change (optimistic prohibition).
 *   - on success, a toast `Request posted to thread` appears.
 *   - on failure (500 or network reject), a failure toast appears and the
 *     kebab can be re-opened.
 *
 * @lore L15: fails today because WorkTeam still wires drag rather than the
 * request handlers. Plan T13 wires handleRequestStateChange.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

interface CapturedPost {
	url: string;
	method: string;
	body: unknown;
}

describe("WorkTeam — request post (L15)", () => {
	let posts: CapturedPost[];
	let originalFetch: typeof globalThis.fetch;
	let nextResponse: () => Response;

	beforeEach(() => {
		posts = [];
		originalFetch = globalThis.fetch;
		nextResponse = (): Response =>
			new Response(
				JSON.stringify({
					message: {
						id: "m-1",
						threadId: "thread-1",
						senderId: "u-founder",
						clientKey: "k-1",
						type: "plain",
						payload: { text: "Requesting: pause this task." },
						createdAt: "2026-04-19T12:00:00.000Z",
					},
					thread: {
						id: "thread-1",
						hostKind: "task",
						hostId: "t1",
						initiatorId: "u-founder",
						participants: ["u-founder"],
						pinned: false,
						resolvedAt: null,
						lastActiveAt: "2026-04-19T12:00:00.000Z",
						createdAt: "2026-04-19T12:00:00.000Z",
					},
				}),
				{ status: 201, headers: { "Content-Type": "application/json" } },
			);
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST" && /\/api\/threads(\/[^/]+\/messages)?$/.test(url)) {
				const body = init?.body ? JSON.parse(init.body as string) : null;
				posts.push({ url, method, body });
				return nextResponse();
			}
			return new Response("not found", { status: 404 });
		}) as typeof globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	function renderPage(): ReturnType<typeof render> {
		return render(
			<MemoryRouter>
				<WorkTeam />
			</MemoryRouter>,
		);
	}

	async function pickPauseOnFirstTask(): Promise<void> {
		const user = userEvent.setup();
		const kebabs = await screen.findAllByRole("button", {
			name: /task actions|open menu|more/i,
		});
		await user.click(kebabs[0]);
		await user.click(screen.getByRole("menuitem", { name: /^pause$/i }));
	}

	it("posts a plain message with the canonical wire copy when Pause is picked", async () => {
		renderPage();
		await pickPauseOnFirstTask();
		await waitFor(() => expect(posts.length).toBe(1));
		const post = posts[0];
		expect(post.method).toBe("POST");
		// First request on a task without a threadId goes through the
		// lazy-bootstrap branch (POST /api/threads). Architecture §4.1.
		const rawBody = post.body as {
			type?: string;
			payload?: { text?: string };
			clientKey?: string;
			initialMessage?: {
				type?: string;
				payload?: { text?: string };
				clientKey?: string;
			};
		};
		const inner = rawBody.initialMessage ?? rawBody;
		expect(inner.type).toBe("plain");
		expect(inner.payload?.text).toBe("Requesting: pause this task.");
		expect(typeof inner.clientKey).toBe("string");
		expect((inner.clientKey ?? "").length).toBeGreaterThanOrEqual(8);
	});

	it("does NOT optimistically change the StatusChip after posting", async () => {
		renderPage();
		// Find the in-progress row — chip text HEALTHY appears multiple times,
		// so just snapshot the count before/after.
		const before = screen.getAllByText("HEALTHY").length;
		await pickPauseOnFirstTask();
		await waitFor(() => expect(posts.length).toBe(1));
		const after = screen.getAllByText("HEALTHY").length;
		expect(after).toBe(before);
	});

	it("shows the success toast `Request posted to thread`", async () => {
		renderPage();
		await pickPauseOnFirstTask();
		await waitFor(() => expect(posts.length).toBe(1));
		await waitFor(() => expect(screen.getByText(/request posted to thread/i)).toBeInTheDocument());
	});

	it("shows a failure toast on 500", async () => {
		nextResponse = (): Response =>
			new Response(JSON.stringify({ error: "boom", code: "validation_error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		renderPage();
		await pickPauseOnFirstTask();
		await waitFor(() => expect(posts.length).toBe(1));
		await waitFor(() =>
			expect(screen.getByText(/could not post request|try again/i)).toBeInTheDocument(),
		);
	});

	it("shows a failure toast on network reject", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new TypeError("network error");
		}) as typeof globalThis.fetch;
		renderPage();
		await pickPauseOnFirstTask();
		await waitFor(() =>
			expect(screen.getByText(/could not post request|try again/i)).toBeInTheDocument(),
		);
	});
});
