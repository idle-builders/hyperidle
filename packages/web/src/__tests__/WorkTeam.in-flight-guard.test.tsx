/**
 * L15 apply-review (AR1/SR1/DR5) — In-flight guard against double-fire.
 *
 * Approved.md §5 "Request in flight": *"Selected menu item shows
 * `loading-xs` spinner inline; menu stays open; kebab disabled."*
 * Architecture §3.4 names this as the front-line guard; without it two
 * distinct UUIDs sneak past the server idempotency unique-constraint.
 *
 * Asserts: rapid double-click on a verb posts exactly ONE message.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

describe("WorkTeam — in-flight guard (L15 apply-review)", () => {
	let posts: number;
	let originalFetch: typeof globalThis.fetch;
	let resolveFetch: (() => void) | null;

	beforeEach(() => {
		posts = 0;
		resolveFetch = null;
		originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST" && /\/api\/threads(\/[^/]+\/messages)?$/.test(url)) {
				posts += 1;
				// Block the response so the second click is attempted while in flight.
				await new Promise<void>((resolve) => {
					resolveFetch = resolve;
				});
				return new Response(
					JSON.stringify({
						thread: {
							id: "th-1",
							hostKind: "task",
							hostId: "t1",
							initiatorId: "u-founder",
							participants: ["u-founder"],
							pinned: false,
							resolvedAt: null,
							lastActiveAt: "2026-04-19T12:00:00.000Z",
							createdAt: "2026-04-19T12:00:00.000Z",
						},
						message: {
							id: "m-1",
							threadId: "th-1",
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
			return new Response("not found", { status: 404 });
		}) as typeof globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("rapid second click while a request is in flight does NOT fire a second fetch", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<WorkTeam />
			</MemoryRouter>,
		);
		const kebabs = await screen.findAllByRole("button", { name: /task actions/i });
		await user.click(kebabs[0]);
		const pause = screen.getByRole("menuitem", { name: /^pause$/i });
		await user.click(pause);
		// First click is now in flight (fetch is awaiting our manual resolve).
		await waitFor(() => expect(posts).toBe(1));

		// Spinner is visible; menu stays open; the kebab is disabled.
		expect(screen.getByTestId("task-pending-spinner")).toBeInTheDocument();

		// Try clicking the same verb again — must be a no-op while pending.
		await user.click(pause);
		// Try clicking the kebab too (should be disabled).
		await user.click(kebabs[0]);
		// posts MUST still be 1.
		expect(posts).toBe(1);

		// Resolve the in-flight request and confirm the spinner clears.
		resolveFetch?.();
		await waitFor(() =>
			expect(screen.queryByTestId("task-pending-spinner")).not.toBeInTheDocument(),
		);
	});
});
