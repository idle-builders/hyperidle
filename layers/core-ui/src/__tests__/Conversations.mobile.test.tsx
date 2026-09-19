/**
 * NEW-28 — mobile page-header container collapses when empty.
 *
 * On a thread page at 375px the PageHeader is empty: leading (breadcrumb)
 * is suppressed on mobile, the title is hidden via `hidden md:block`, and
 * dialInButton is null (no active session). Before the fix this left a 37px
 * container. After the fix the header is omitted entirely — no data-ds-component
 * attribute in the DOM when there is no visible content on mobile.
 *
 * @lore BC3: the thread surface is `call("open_thread"|...)`, never a fetch to
 * a deleted `/api/threads*` route. Mocks target `call` directly (see
 * `.claude/rules/testing.md`'s UI test rule).
 */

import type { ThreadView } from "@hyperidle/domain-model";
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

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Founder", email: "f@x", avatarUrl: null },
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

// ---------------------------------------------------------------------------
// call() mock — minimal thread detail so ConversationsDetail mounts.
// ---------------------------------------------------------------------------

const THREAD_ID = "t-new28";

// A team-hosted thread — there is no "task" host kind; a task's own
// thread is team-hosted.
const FAKE_THREAD: ThreadView["thread"] = {
	id: THREAD_ID,
	hostKind: "team",
	hostId: "team-1",
	initiatorId: "agent-1",
	members: ["u-founder", "agent-1"],
	title: null,
	computedTitle: "Founder / Aria",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const FAKE_MEMBERS: ThreadView["members"] = [
	{ id: "u-founder", name: "Founder", role: "founder", isAgent: false },
	{ id: "agent-1", name: "Aria", role: "agent", isAgent: true },
];

describe("NEW-28 — mobile conversation header collapses when empty", () => {
	beforeEach(() => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				return {
					ok: true,
					data: {
						thread: FAKE_THREAD,
						members: FAKE_MEMBERS,
						messages: [],
						headMessageId: null,
						hostTitle: "Founder / Aria",
					},
				};
			}
			return { ok: true, data: [] };
		});
	});

	afterEach(() => {
		callMock.mockReset();
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
