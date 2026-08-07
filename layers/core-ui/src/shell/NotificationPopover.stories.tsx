/**
 * AF8 — NotificationPopover stories.
 * Renders key states for visual verification.
 *
 * Each story injects its own data via the `_data` prop so states are rendered
 * deterministically without relying on API calls or module mocking.
 *
 * @lore AF8 W2: Stories previously all called useNotifications() with no mock,
 * rendering the same (API-error) state. Now each story passes `_data` to drive
 * its distinct loading/error/empty/populated state independently.
 */

import type { JSX } from "react";
import type { NotificationRow, UseNotificationsResult } from "../hooks/useNotifications.js";
import { NotificationPopover } from "./NotificationPopover";

export default {
	title: "NotificationPopover",
	tier: "3" as const,
	uses: [],
};

const noop = (): void => undefined;
const noopAsync = async (): Promise<void> => undefined;
const noopAsyncId = async (_id: string): Promise<void> => undefined;
const noopAsyncKey = async (_key: string): Promise<void> => undefined;

function makeData(overrides: Partial<UseNotificationsResult>): UseNotificationsResult {
	return {
		unseenCount: 0,
		rows: [],
		status: "ready",
		refetch: noopAsync,
		markSeen: noopAsync,
		markRead: noopAsyncId,
		muteType: noopAsyncKey,
		...overrides,
	};
}

const sampleRows: NotificationRow[] = [
	{
		id: "notif-1",
		typeKey: "review_request",
		urgency: "immediate",
		title: "Review needed: Ambrovia v2 deploy plan",
		sourceLink: "/conversations/thread-review",
		createdAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
		seenAt: null,
		readAt: null,
	},
	{
		id: "notif-2",
		typeKey: "blocker_alert",
		urgency: "immediate",
		title: "Build pipeline is blocked on failing type-checks",
		sourceLink: "/conversations/thread-blocker",
		createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
		seenAt: null,
		readAt: null,
	},
	{
		id: "notif-3",
		typeKey: "blocker_alert",
		urgency: "immediate",
		title: "Deploy pipeline is blocked on a failing smoke test",
		sourceLink: "/conversations/thread-blocker-2",
		createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
		seenAt: null,
		readAt: null,
	},
	{
		id: "notif-4",
		typeKey: "review_request",
		urgency: "ambient",
		title: "Low-priority review: documentation update",
		sourceLink: "/conversations/thread-ambient",
		createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
		seenAt: "2024-01-01T00:00:00Z",
		readAt: null,
	},
];

/** Empty state: no notifications. */
export function Empty(): JSX.Element {
	return (
		<div style={{ height: "500px", position: "relative" }}>
			<NotificationPopover
				open={true}
				onClose={noop}
				_data={makeData({ status: "ready", rows: [], unseenCount: 0 })}
			/>
		</div>
	);
}

/** Loading state: fetching in progress. */
export function LoadingState(): JSX.Element {
	return (
		<div style={{ height: "500px", position: "relative" }}>
			<NotificationPopover
				open={true}
				onClose={noop}
				_data={makeData({ status: "loading", rows: [] })}
			/>
		</div>
	);
}

/** Error state: fetch failed, Retry button shown. */
export function ErrorState(): JSX.Element {
	return (
		<div style={{ height: "500px", position: "relative" }}>
			<NotificationPopover
				open={true}
				onClose={noop}
				_data={makeData({ status: "error", rows: [] })}
			/>
		</div>
	);
}

/** Populated: multiple notification rows (immediate + ambient). */
export function Populated(): JSX.Element {
	return (
		<div style={{ height: "600px", position: "relative" }}>
			<NotificationPopover
				open={true}
				onClose={noop}
				_data={makeData({ status: "ready", rows: sampleRows, unseenCount: 3 })}
			/>
		</div>
	);
}

/** Closed: popover not shown. */
export function Closed(): JSX.Element {
	return (
		<div style={{ height: "300px", position: "relative", padding: "24px" }}>
			<p
				style={{
					color: "var(--text-secondary)",
					fontFamily: "var(--font-sans)",
					fontSize: "13px",
				}}
			>
				Popover is closed (open=false). Nothing renders.
			</p>
			<NotificationPopover open={false} onClose={noop} />
		</div>
	);
}
