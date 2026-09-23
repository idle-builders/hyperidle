/**
 * AF8 — NotificationPopover stories.
 * Renders key states for visual verification.
 *
 * Each story injects its own data via the `_data` prop so states are rendered
 * deterministically without relying on API calls or module mocking.
 *
 * @lore BC5 T10: rows are inbox items over `ChangeRow` now — `typeKey`/
 * `urgency`/`sourceLink`/`createdAt` are gone with the notification-type
 * registry; a row is `{ change, seenAt, readAt }` (architecture.md §8).
 */

import type { JSX } from "react";
import type { InboxItem, UseNotificationsResult } from "../hooks/useNotifications.js";
import { NotificationPopover } from "./NotificationPopover";

export default {
	title: "NotificationPopover",
	tier: "3" as const,
	uses: [],
};

const noop = (): void => undefined;
const noopAsync = async (): Promise<void> => undefined;
const noopAsyncId = async (_id: string): Promise<void> => undefined;

function makeData(overrides: Partial<UseNotificationsResult>): UseNotificationsResult {
	return {
		unseenCount: 0,
		rows: [],
		status: "ready",
		refetch: noopAsync,
		markSeen: noopAsync,
		markRead: noopAsyncId,
		...overrides,
	};
}

const sampleRows: InboxItem[] = [
	{
		change: {
			id: "change-1",
			object: "thread",
			objectId: "thread-review",
			kind: "message",
			actor: "u-reviewer",
			before: null,
			after: {},
			at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
		},
		seenAt: null,
		readAt: null,
	},
	{
		change: {
			id: "change-2",
			object: "task",
			objectId: "task-blocker",
			kind: "changed",
			actor: "u-founder",
			before: {},
			after: {},
			at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
		},
		seenAt: null,
		readAt: null,
	},
	{
		change: {
			id: "change-3",
			object: "task",
			objectId: "task-blocker-2",
			kind: "changed",
			actor: "u-founder",
			before: {},
			after: {},
			at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
		},
		seenAt: null,
		readAt: null,
	},
	{
		change: {
			id: "change-4",
			object: "document",
			objectId: "doc-ambient",
			kind: "changed",
			actor: "u-writer",
			before: {},
			after: {},
			at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
		},
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
			<NotificationPopover open={true} onClose={noop} _data={makeData({ status: "loading", rows: [] })} />
		</div>
	);
}

/** Error state: fetch failed, Retry button shown. */
export function ErrorState(): JSX.Element {
	return (
		<div style={{ height: "500px", position: "relative" }}>
			<NotificationPopover open={true} onClose={noop} _data={makeData({ status: "error", rows: [] })} />
		</div>
	);
}

/** Populated: multiple inbox rows. */
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
