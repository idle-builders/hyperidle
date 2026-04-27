/**
 * L3 — Thread List / Queue Rendering. Routing filter chip tests (red phase).
 *
 * Covers ACs:
 *  - Mine / Routed-to-CEO / Routed-to-CPO chips render above the list when
 *    /api/me actor identity is available.
 *  - Default selection: "All".
 *  - Clicking a chip mutates URL query param `?routedTo=` (mine|ceo|cpo).
 *
 * The component does not exist yet; these tests must FAIL today.
 */

import type { ThreadListEntry } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConversationsSubmenu } from "./ConversationsSubmenu";

const NOW = Date.parse("2026-04-26T12:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();

function thread(id: string, over: Partial<ThreadListEntry> = {}): ThreadListEntry {
	return {
		id,
		kind: over.kind ?? "review",
		pinned: over.pinned ?? false,
		participants: over.participants ?? [],
		routedToActorId: over.routedToActorId ?? null,
		routedToActorRole: over.routedToActorRole ?? null,
		domainTag: over.domainTag ?? null,
		createdAt: over.createdAt ?? iso(NOW - 60_000),
		lastActivityAt: over.lastActivityAt ?? iso(NOW - 60_000),
		blocking: over.blocking ?? false,
		resolvedAt: over.resolvedAt ?? null,
		title: over.title ?? id,
		snippet: over.snippet ?? "",
		unread: over.unread ?? false,
	};
}

const ME = { id: "actor:ceo", role: "CEO" as const, domain_tags: ["growth"] };

const FIXTURE: ThreadListEntry[] = [
	thread("t-mine", {
		kind: "review",
		routedToActorId: "actor:ceo",
		routedToActorRole: "CEO",
	}),
	thread("t-ceo-other", {
		kind: "review",
		routedToActorId: "actor:ceo-other",
		routedToActorRole: "CEO",
	}),
	thread("t-cpo", { kind: "review", routedToActorId: "actor:cpo", routedToActorRole: "CPO" }),
	thread("t-unrouted", { kind: "chat", routedToActorId: null, routedToActorRole: null }),
];

function renderAt(initialPath: string): ReturnType<typeof createMemoryRouter> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <ConversationsSubmenu threads={FIXTURE} me={ME} now={NOW} />,
			},
		],
		{ initialEntries: [initialPath] },
	);
	render(<RouterProvider router={router} />);
	return router;
}

describe("L3 — routing filter chips (Mine / CEO / CPO / All)", () => {
	it("renders the four chips above the list", () => {
		renderAt("/");
		const chipBar = screen.getByTestId("routing-filter-chips");
		expect(chipBar).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /^all$/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /^mine$/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /routed to ceo/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /routed to cpo/i })).toBeInTheDocument();
	});

	it("defaults selection to 'All' when no ?routedTo= param is present", () => {
		renderAt("/");
		expect(screen.getByRole("tab", { name: /^all$/i })).toHaveAttribute("aria-selected", "true");
	});

	it("reflects ?routedTo=mine in the selected chip", () => {
		renderAt("/?routedTo=mine");
		expect(screen.getByRole("tab", { name: /^mine$/i })).toHaveAttribute("aria-selected", "true");
	});

	it("clicking 'Mine' updates the URL to ?routedTo=mine", async () => {
		const user = userEvent.setup();
		const router = renderAt("/");
		await user.click(screen.getByRole("tab", { name: /^mine$/i }));
		expect(router.state.location.search).toContain("routedTo=mine");
	});

	it("clicking 'Routed to CPO' updates the URL to ?routedTo=cpo", async () => {
		const user = userEvent.setup();
		const router = renderAt("/");
		await user.click(screen.getByRole("tab", { name: /routed to cpo/i }));
		expect(router.state.location.search).toContain("routedTo=cpo");
	});

	it("selecting 'All' clears the ?routedTo= param", async () => {
		const user = userEvent.setup();
		const router = renderAt("/?routedTo=mine");
		await user.click(screen.getByRole("tab", { name: /^all$/i }));
		expect(router.state.location.search).not.toContain("routedTo=");
	});

	it("filters the rendered list to threads routed to the current actor when 'Mine' is selected", () => {
		renderAt("/?routedTo=mine");
		expect(document.querySelector('[data-thread-id="t-mine"]')).not.toBeNull();
		expect(document.querySelector('[data-thread-id="t-ceo-other"]')).toBeNull();
		expect(document.querySelector('[data-thread-id="t-cpo"]')).toBeNull();
	});

	it("filters by role when 'Routed to CPO' is selected", () => {
		renderAt("/?routedTo=cpo");
		expect(document.querySelector('[data-thread-id="t-cpo"]')).not.toBeNull();
		expect(document.querySelector('[data-thread-id="t-mine"]')).toBeNull();
		expect(document.querySelector('[data-thread-id="t-ceo-other"]')).toBeNull();
	});

	it("hides the chip bar when /api/me identity is null (loading or unauthenticated)", () => {
		// me=null path: chips are gated on actor identity.
		render(
			<MemoryRouter>
				<ConversationsSubmenu threads={FIXTURE} me={null} now={NOW} />
			</MemoryRouter>,
		);
		expect(screen.queryByTestId("routing-filter-chips")).toBeNull();
	});
});
