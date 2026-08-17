/**
 * NEW-28 — mobile page-header container collapses when empty.
 *
 * On a thread page at 375px the PageHeader is empty: leading (breadcrumb)
 * is suppressed on mobile, the title is hidden via `hidden md:block`, and
 * dialInButton is null (no active session). Before the fix this left a 37px
 * container. After the fix the header is omitted entirely — no data-ds-component
 * attribute in the DOM when there is no visible content on mobile.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

// ---------------------------------------------------------------------------
// Viewport mock — simulate 375px mobile (sidebarMobile=true).
// ---------------------------------------------------------------------------

vi.mock("../hooks/useViewportBreakpoint.js", () => ({
	useViewportBreakpoint: vi.fn(() => ({ sidebarMobile: true })),
}));

// ---------------------------------------------------------------------------
// Fetch mock — minimal thread detail so ConversationsDetail mounts.
// ---------------------------------------------------------------------------

const THREAD_ID = "t-new28";
const FAKE_THREAD = {
	id: THREAD_ID,
	hostKind: "task",
	hostId: "task-1",
	initiatorId: "agent-1",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const THREAD_DETAIL = {
	thread: FAKE_THREAD,
	messages: [],
	headMessageId: null,
	identities: {
		"u-founder": { name: "Founder", role: "founder" },
		"agent-1": { name: "Aria", role: "agent" },
	},
};

function installFetch(): void {
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.includes("/api/auth/me")) {
			return new Response(
				JSON.stringify({ id: "u-founder", name: "Founder", email: "f@x", avatarUrl: null }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		if (url.endsWith(`/api/threads/${THREAD_ID}`)) {
			return new Response(JSON.stringify(THREAD_DETAIL), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response("not found", { status: 404 });
	}) as typeof globalThis.fetch;
}

describe("NEW-28 — mobile conversation header collapses when empty", () => {
	let originalFetch: typeof globalThis.fetch;
	beforeEach(() => {
		originalFetch = globalThis.fetch;
		installFetch();
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("does not render the PageHeader on mobile when there is no active session (no visible content)", async () => {
		render(
			<MemoryRouter initialEntries={[`/conversations/${THREAD_ID}`]}>
				<Routes>
					<Route path="/conversations/:threadId" element={<Conversations />} />
				</Routes>
			</MemoryRouter>,
		);

		// Wait for the outer page shell to mount — there are two elements with
		// conversations-page testid (the wrapper div + ConversationsDetail's
		// internal state), so use findAllByTestId to avoid a "multiple found" error.
		await screen.findAllByTestId("conversations-page");

		// On mobile with no active session, the PageHeader must not be in the DOM.
		// Before the fix: empty <header> container occupies 37px of space.
		// After the fix: header=undefined → PageScaffold skips it → no element.
		const pageHeader = document.querySelector('[data-ds-component="PageHeader"]');
		expect(pageHeader).toBeNull();
	});
});
