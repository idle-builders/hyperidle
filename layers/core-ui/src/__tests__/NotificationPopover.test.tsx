/**
 * AF8 — NotificationPopover component tests
 *
 * Covers:
 *   AC10 — popover renders rows (title + link jump + relative time + dismiss)
 *         — unseen dot shown when unseenCount > 0
 *         — opening calls mark-seen
 *         — dismiss calls mark-read and removes row
 *         — empty/loading/error states render
 *
 * @lore BC5 T10: rows are inbox items over `ChangeRow` now — a row is
 * `{ change, seenAt, readAt }` and there is no per-type mute in the popover
 * any more (a subscription's own pause lives in Settings → Notifications).
 *
 * Note: The popover is a Tier-3 shell composition (layers/core-ui/src/shell/NotificationPopover.tsx).
 * It uses the useNotifications hook internally.
 */

import type { ChangeRow } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We mock useNotifications so the component is isolated from API calls
vi.mock("../hooks/useNotifications", () => ({
	useNotifications: vi.fn(),
}));

// Mock react-router-dom navigate (popover calls navigate(link) on row click).
vi.mock("react-router-dom", () => ({
	useNavigate: vi.fn(() => vi.fn()),
	// biome-ignore lint/suspicious/noExplicitAny: mock simplicity
	Link: ({ to, children, ...rest }: any) => (
		<a href={String(to)} {...rest}>
			{children}
		</a>
	),
}));

type InboxItem = {
	change: ChangeRow;
	seenAt: string | null;
	readAt: string | null;
};

function makeMockRow(overrides: Partial<ChangeRow> = {}): InboxItem {
	return {
		change: {
			id: "change-1",
			object: "thread",
			objectId: "thread-1",
			kind: "message",
			actor: "u-someone",
			before: null,
			after: {},
			at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
			...overrides,
		},
		seenAt: null,
		readAt: null,
	};
}

describe("NotificationPopover component", () => {
	let markSeenMock: ReturnType<typeof vi.fn>;
	let markReadMock: ReturnType<typeof vi.fn>;
	let refetchMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		markSeenMock = vi.fn().mockResolvedValue(undefined);
		markReadMock = vi.fn().mockResolvedValue(undefined);
		refetchMock = vi.fn().mockResolvedValue(undefined);

		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 0,
			rows: [],
			status: "ready",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders empty state when no rows", async () => {
		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

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
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		expect(screen.getByRole("status", { name: /loading notifications/i })).toBeInTheDocument();
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
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /retry/i }));

		await waitFor(() => {
			expect(refetchMock).toHaveBeenCalledOnce();
		});
	});

	it("renders rows with title, object label, and relative time", async () => {
		const { useNotifications } = await import("../hooks/useNotifications");
		vi.mocked(useNotifications).mockReturnValue({
			unseenCount: 1,
			rows: [makeMockRow()],
			status: "ready",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		expect(screen.getByText("Conversation message")).toBeInTheDocument();
		expect(screen.getByText("thread")).toBeInTheDocument();
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
			rows: [makeMockRow({ id: "change-dismiss" })],
			status: "ready",
			refetch: refetchMock,
			markSeen: markSeenMock,
			markRead: markReadMock,
		} as unknown as import("../hooks/useNotifications.js").UseNotificationsResult);

		const { NotificationPopover } = await import("../shell/NotificationPopover.js");
		render(<NotificationPopover open={true} onClose={vi.fn()} />);

		const user = userEvent.setup();
		const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
		await user.click(dismissBtn);

		await waitFor(() => {
			expect(markReadMock).toHaveBeenCalledWith("change-dismiss");
		});
	});
});

describe("Sidebar unread dot affordance", () => {
	it("renders unread dot when unseenCount > 0", async () => {
		vi.mock("../hooks/useNotifications", () => ({
			useNotifications: vi.fn(() => ({
				unseenCount: 3,
				rows: [],
				status: "ready",
				markSeen: vi.fn(),
				markRead: vi.fn(),
			})),
		}));

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
