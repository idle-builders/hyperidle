/**
 * L15 step15 (write-tests) — Lazy thread bootstrap on first request.
 *
 * Approved.md §4.3. Plan §4.1 + §6 task #17.
 *
 * The first request on a task that has no thread yet calls
 *   POST /api/threads
 * (atomic create + initial message). The second request for the same task
 * uses the captured thread.id and calls
 *   POST /api/threads/<id>/messages
 *
 * @lore L15: fails today because the lazy-bootstrap branch is not wired
 * in WorkTeam.tsx. Plan T13 adds it.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

interface CapturedPost {
	url: string;
	body: unknown;
}

describe("WorkTeam — lazy bootstrap (L15)", () => {
	let posts: CapturedPost[];
	let originalFetch: typeof globalThis.fetch;
	const NEW_THREAD_ID = "thread-bootstrapped-1";

	beforeEach(() => {
		posts = [];
		originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST" && /\/api\/threads$/.test(url)) {
				const body = init?.body ? JSON.parse(init.body as string) : null;
				posts.push({ url, body });
				return new Response(
					JSON.stringify({
						thread: {
							id: NEW_THREAD_ID,
							hostKind: "task",
							hostId: (body as { hostId?: string })?.hostId,
							initiatorId: "u-founder",
							participants: ["u-founder"],
							pinned: false,
							resolvedAt: null,
							lastActiveAt: "2026-04-19T12:00:00.000Z",
							createdAt: "2026-04-19T12:00:00.000Z",
						},
						message: {
							id: "m-init",
							threadId: NEW_THREAD_ID,
							senderId: "u-founder",
							clientKey: "k-1",
							type: "plain",
							payload: { text: "Requesting: pause this task." },
							createdAt: "2026-04-19T12:00:00.000Z",
						},
					}),
					{ status: 201, headers: { "Content-Type": "application/json" } },
				);
			}
			if (method === "POST" && /\/api\/threads\/[^/]+\/messages$/.test(url)) {
				const body = init?.body ? JSON.parse(init.body as string) : null;
				posts.push({ url, body });
				return new Response(
					JSON.stringify({
						message: {
							id: "m-2",
							threadId: NEW_THREAD_ID,
							senderId: "u-founder",
							clientKey: "k-2",
							type: "plain",
							payload: { text: "Requesting: mark this task as blocked." },
							createdAt: "2026-04-19T12:00:00.000Z",
						},
					}),
					{ status: 201, headers: { "Content-Type": "application/json" } },
				);
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

	async function pickVerbOnFirstTask(verbName: RegExp): Promise<void> {
		const user = userEvent.setup();
		const kebabs = await screen.findAllByRole("button", {
			name: /task actions|open menu|more/i,
		});
		await user.click(kebabs[0]);
		await user.click(screen.getByRole("menuitem", { name: verbName }));
	}

	it("first request creates the thread atomically (POST /api/threads)", async () => {
		renderPage();
		await pickVerbOnFirstTask(/^pause$/i);
		await waitFor(() => expect(posts.length).toBe(1));
		const post = posts[0];
		expect(post.url).toMatch(/\/api\/threads$/);
		const body = post.body as {
			hostKind?: string;
			hostId?: string;
			initialMessage?: { type?: string; payload?: { text?: string } };
		};
		expect(body.hostKind).toBe("task");
		expect(typeof body.hostId).toBe("string");
		expect(body.initialMessage?.type).toBe("plain");
		expect(body.initialMessage?.payload?.text).toBe("Requesting: pause this task.");
	});

	it("second request reuses the bootstrapped thread id", async () => {
		renderPage();
		await pickVerbOnFirstTask(/^pause$/i);
		await waitFor(() => expect(posts.length).toBe(1));
		await pickVerbOnFirstTask(/mark blocked/i);
		await waitFor(() => expect(posts.length).toBe(2));
		const second = posts[1];
		expect(second.url).toMatch(new RegExp(`/api/threads/${NEW_THREAD_ID}/messages$`));
		const body = second.body as {
			type?: string;
			payload?: { text?: string };
		};
		expect(body.type).toBe("plain");
		expect(body.payload?.text).toBe("Requesting: mark this task as blocked.");
	});
});
