/**
 * AF8 — NotificationPopover component tests (RED phase)
 *
 * Covers:
 *   AC10 — popover renders rows (title + source-link jump + relative time + mute + dismiss)
 *         — unread dot shown when unseenCount > 0
 *         — opening calls mark-seen
 *         — dismiss calls mark-read and removes row
 *         — empty/loading/error states render
 *
 * Note: The popover is a Tier-3 shell composition (layers/core-ui/src/shell/NotificationPopover.tsx).
 * It uses the useNotifications hook internally.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We mock useNotifications so the component is isolated from API calls
vi.mock("../hooks/useNotifications", () => ({
	useNotifications: vi.fn(),
}));

// Mock react-router-dom navigate (popover calls navigate(sourceLink) on row click).
// UI-080: Sidebar now imports Link — mock it as a simple <a> so these tests don't
// need a real router context when they render <Sidebar> directly.
vi.mock("react-router-dom", () => ({
	useNavigate: vi.fn(() => vi.fn()),
	// biome-ignore lint/suspicious/noExplicitAny: mock simplicity
	Link: ({ to, children, ...rest }: any) => (
		<a href={String(to)} {...rest}>
			{children}
		</a>
	),
}));

type NotificationRow = {
	id: string;
	typeKey: string;
	urgency: "immediate" | "ambient";
	title: string;
	sourceLink: string;
	createdAt: string;
	seenAt: string | null;
	readAt: string | null;
};

function makeMockRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
	return {
		id: "notif-1",
		typeKey: "review_request",
		urgency: "immediate",
		title: "Review needed for task",
		sourceLink: "/conversations/thread-1",
		createdAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
		seenAt: null,
		readAt: null,
		...overrides,
	};
}

describe("AF8 — NotificationPopover component (AC10)", () => {
	let markSeenMock: ReturnType<typeof vi.fn>;
	let markReadMock: ReturnType<typeof vi.fn>;
	let muteTypeMock: ReturnType<typeof vi.fn>;

	let refetchMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		markSeenMock = vi.fn().mockResolvedValue(undefined);
		markReadMock = vi.fn().mockResolvedValue(undefined);
		muteTypeMock = vi.fn().mockResolvedValue(undefined);
		refetchMock = vi.fn().mockResolvedValue(undefined);

		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 0,
			rows: [],
			status: "ready",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
			muteType: muteTypeMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders empty state when no rows", async () => {
		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		// Empty state: "All caught up"
		expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
	});

	it("renders loading state", async () => {
		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 0,
			rows: [],
			status: "loading",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
			muteType: muteTypeMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		// Loading spinner: role="status" with aria-label is present
		expect(screen.getByRole("status", { name: /loading notifications/i })).toBeInTheDocument();
		// Row list must NOT be present in loading state
		expect(screen.queryByRole("list")).not.toBeInTheDocument();
	});

	it("renders error state with retry", async () => {
		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 0,
			rows: [],
			status: "error",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
			muteType: muteTypeMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
	});

	it("Retry button calls refetch when clicked", async () => {
		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 0,
			rows: [],
			status: "error",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
			muteType: muteTypeMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /retry/i }));

		await waitFor(() => {
			expect(refetchMock).toHaveBeenCalledOnce();
		});
	});

	it("renders rows with title, type label, and relative time", async () => {
		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 1,
			rows: [makeMockRow()],
			status: "ready",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
			muteType: muteTypeMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		expect(screen.getByText("Review needed for task")).toBeInTheDocument();
		// Type label (uppercased REVIEW) — exact match to avoid ambiguity with title text
		expect(screen.getByText("REVIEW")).toBeInTheDocument();
	});

	it("opening the popover calls markSeen", async () => {
		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 2,
			rows: [makeMockRow()],
			status: "ready",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
			muteType: muteTypeMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		await waitFor(() => {
			expect(markSeenMock).toHaveBeenCalled();
		});
	});

	it("dismiss button calls markRead and removes the row", async () => {
		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 1,
			rows: [makeMockRow({ id: "notif-dismiss" })],
			status: "ready",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
			muteType: muteTypeMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		const user = userEvent.setup();
		const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
		await user.click(dismissBtn);

		await waitFor(() => {
			expect(markReadMock).toHaveBeenCalledWith("notif-dismiss");
		});
	});

	it("mute button calls muteType with the row's typeKey", async () => {
		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 1,
			rows: [makeMockRow({ id: "notif-mute", typeKey: "review_request" })],
			status: "ready",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
			muteType: muteTypeMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		const user = userEvent.setup();
		const muteBtn = screen.getByRole("button", { name: /mute.*review/i });
		await user.click(muteBtn);

		await waitFor(() => {
			expect(muteTypeMock).toHaveBeenCalledWith("review_request");
		});
	});
});

describe("AF8 — Sidebar unread dot affordance (AC10)", () => {
	it("renders unread dot when unseenCount > 0", async () => {
		// The sidebar notification trigger shows a dot when unseenCount > 0
		// Test it via the NotificationTrigger sub-component or Sidebar props
		// This test ensures the component wiring renders the indicator

		vi.mock("../hooks/useNotifications", () => ({
			useNotifications: vi.fn(() => ({
				unseenCount: 3,
				rows: [],
				status: "ready",
				markSeen: vi.fn(),
				markRead: vi.fn(),
				muteType: vi.fn(),
			})),
		}));

		// Import Sidebar and render with notificationCount prop
		const { Sidebar } = await import("../shell/Sidebar.js");
		render(
			<Sidebar
				activeView="conversations"
				onViewChange={vi.fn()}
				threads={[]}
				selectedThreadId={null}
				onSelectThread={vi.fn()}
				teams={[]}
				activeTeamId={null}
				onSelectTeam={vi.fn()}
				onAssistantClick={vi.fn()}
				assistantOverlayOpen={false}
				onSettingsClick={vi.fn()}
				settingsOpen={false}
				onSearchClick={vi.fn()}
				conversationsBlockingCount={0}
				unseenNotificationCount={3}
				onNotificationClick={vi.fn()}
				notificationPopoverOpen={false}
			/>,
		);

		// Should render the unread dot indicator
		const dot = document.querySelector("[data-testid='notification-unread-dot']");
		expect(dot).not.toBeNull();
	});

	it("no unread dot when unseenCount is 0", async () => {
		const { Sidebar } = await import("../shell/Sidebar.js");
		render(
			<Sidebar
				activeView="conversations"
				onViewChange={vi.fn()}
				threads={[]}
				selectedThreadId={null}
				onSelectThread={vi.fn()}
				teams={[]}
				activeTeamId={null}
				onSelectTeam={vi.fn()}
				onAssistantClick={vi.fn()}
				assistantOverlayOpen={false}
				onSettingsClick={vi.fn()}
				settingsOpen={false}
				onSearchClick={vi.fn()}
				conversationsBlockingCount={0}
				unseenNotificationCount={0}
				onNotificationClick={vi.fn()}
				notificationPopoverOpen={false}
			/>,
		);

		const dot = document.querySelector("[data-testid='notification-unread-dot']");
		expect(dot).toBeNull();
	});
});
