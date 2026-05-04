/**
 * L15 step16 (write-tests) — Open thread navigates to /conversations/review.
 *
 * Approved.md §4.3 + §5 ("Populated, no thread"). Plan §3.6 + §6 task #14.
 *
 * Picking "Open thread" from the kebab on a task with NO existing thread
 * bootstraps the thread server-side via POST /api/threads, then navigates
 * to /conversations/review?id=<thread.id>. Approved §5 row "Populated, no
 * thread": *"Open thread row present; on activation, creates the thread
 * server-side then navigates."*
 *
 * @lore L15 DR4: previously routed to /conversations/review?id= (empty id).
 * Apply-review fixed it to bootstrap-then-navigate.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

function LocationProbe(): JSX.Element {
	const location = useLocation();
	return <div data-testid="probe-pathname">{location.pathname + location.search}</div>;
}

import type { JSX } from "react";

describe("WorkTeam — open thread navigation (L15)", () => {
	let originalFetch: typeof globalThis.fetch;
	const NEW_THREAD_ID = "thread-opened-1";

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST" && /\/api\/threads$/.test(url)) {
				return new Response(
					JSON.stringify({
						thread: {
							id: NEW_THREAD_ID,
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
			}
			return new Response("not found", { status: 404 });
		}) as typeof globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("Open thread bootstraps a thread and navigates to /conversations/review?id=<threadId>", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/work/team"]}>
				<Routes>
					<Route path="/work/team" element={<WorkTeam />} />
					<Route path="/conversations/review" element={<LocationProbe />} />
				</Routes>
			</MemoryRouter>,
		);
		const kebabs = await screen.findAllByRole("button", {
			name: /task actions/i,
		});
		await user.click(kebabs[0]);
		await user.click(screen.getByRole("menuitem", { name: /open thread/i }));
		const probe = await screen.findByTestId("probe-pathname");
		await waitFor(() =>
			expect(probe.textContent).toBe(`/conversations/review?id=${NEW_THREAD_ID}`),
		);
	});
});
