/**
 * M3 RED — Avatar rendering: initials chip when no avatarUrl, img when present (E1, E2).
 *
 * These tests FAIL until:
 *  - FALLBACK_AVATAR is deleted from useConversationsThreads.ts
 *  - Thread list item renderer uses conditional rendering:
 *    avatarUrl present → <img>, name present → initials chip, neither → User icon
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We test the rendering by checking what the ThreadSections/conversations panel shows
// when given thread data with null avatarUrl.
// The exact component depends on where renderAvatar() lives — likely ThreadSections or similar.

// Mock the conversations hook to feed controlled thread data
vi.mock("../hooks/useConversationsThreads", () => ({
	useConversationsThreads: vi.fn().mockReturnValue({
		items: [],
		isLoading: false,
		error: null,
		hasMore: false,
		loadMore: vi.fn(),
		refresh: vi.fn(),
	}),
}));

import { useConversationsThreads } from "../hooks/useConversationsThreads";

type ThreadItem = {
	id: string;
	title: string;
	avatarUrl: string | null;
	snippet: string;
	timestamp: string;
	unread: boolean;
	kind: "plain" | "review" | "questionnaire";
	participants: string[];
	hostKind: string;
	hostId: string;
};

function makeItem(overrides: Partial<ThreadItem> = {}): ThreadItem {
	return {
		id: "thread-1",
		title: "Test Thread",
		avatarUrl: null,
		snippet: "Latest message",
		timestamp: "1m ago",
		unread: false,
		kind: "plain",
		participants: ["user-1"],
		hostKind: "task",
		hostId: "task-1",
		...overrides,
	};
}

describe("M3 — Thread avatar: initials chip when avatarUrl is null (E1/E2)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders initials chip when avatarUrl is null and title is available", async () => {
		vi.mocked(useConversationsThreads).mockReturnValue({
			items: [makeItem({ title: "Task thread abc", avatarUrl: null })],
			isLoading: false,
			error: null,
			hasMore: false,
			loadMore: vi.fn(),
			refresh: vi.fn(),
		} as unknown as ReturnType<typeof useConversationsThreads>);

		const { Submenu } = await import("../shell/Submenu");
		render(
			<MemoryRouter>
				<Submenu activeView="conversations" onThreadSelect={() => {}} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Task thread abc")).toBeInTheDocument();
		});

		// Initials derived from "Task thread abc" = "Ta" (first two letters of first word)
		// OR "TA" (uppercase first letter of each word — "Task" → "T", first word only)
		// Contract: single word → uppercase first two letters → "TA" or "Ta"
		const initialsElements = screen.queryAllByText(/^[A-Z]{2}$/);
		expect(initialsElements.length).toBeGreaterThan(0);
	});

	it("does NOT use FALLBACK_AVATAR data URI when avatarUrl is null", async () => {
		vi.mocked(useConversationsThreads).mockReturnValue({
			items: [makeItem({ title: "No avatar thread", avatarUrl: null })],
			isLoading: false,
			error: null,
			hasMore: false,
			loadMore: vi.fn(),
			refresh: vi.fn(),
		} as unknown as ReturnType<typeof useConversationsThreads>);

		const { Submenu } = await import("../shell/Submenu");
		const { container } = render(
			<MemoryRouter>
				<Submenu activeView="conversations" onThreadSelect={() => {}} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("No avatar thread")).toBeInTheDocument();
		});

		// The FALLBACK_AVATAR was a data: URI SVG — check no img with data: src exists
		const imgs = container.querySelectorAll("img");
		for (const img of imgs) {
			expect(img.getAttribute("src") ?? "").not.toMatch(/^data:/);
		}
	});

	it("renders <img> element when avatarUrl is a valid URL", async () => {
		vi.mocked(useConversationsThreads).mockReturnValue({
			items: [makeItem({ title: "Thread with Avatar", avatarUrl: "https://example.com/av.png" })],
			isLoading: false,
			error: null,
			hasMore: false,
			loadMore: vi.fn(),
			refresh: vi.fn(),
		} as unknown as ReturnType<typeof useConversationsThreads>);

		const { Submenu } = await import("../shell/Submenu");
		const { container } = render(
			<MemoryRouter>
				<Submenu activeView="conversations" onThreadSelect={() => {}} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Thread with Avatar")).toBeInTheDocument();
		});

		const img = container.querySelector('img[src="https://example.com/av.png"]');
		expect(img).not.toBeNull();
	});
});
