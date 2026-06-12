import type { ThreadItem } from "./ThreadSections";
import { ThreadSections } from "./ThreadSections";

export default { title: "ThreadSections", tier: "utility" as const };

const AVATAR =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23374151'/%3E%3C/svg%3E";

const NOW = Date.parse("2026-04-30T12:00:00Z");

const SAMPLE: ThreadItem[] = [
	{
		id: "b1",
		title: "Blocking: prod outage review",
		snippet: "Waiting on rollback verdict",
		timestamp: "2m",
		avatarUrl: AVATAR,
		hostKind: "task",
		hasUnresolvedReview: true,
		blocking: true,
		pinned: false,
		status: "blocked",
		lastActiveAt: new Date(NOW - 2 * 60 * 1000).toISOString(),
	},
	{
		id: "p1",
		title: "System Agent — weekly",
		snippet: "Pinned to the top",
		timestamp: "1h",
		avatarUrl: AVATAR,
		hostKind: "user",
		hasUnresolvedReview: false,
		blocking: false,
		pinned: true,
		lastActiveAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
	},
	{
		id: "r1",
		title: "Review: onboarding copy pass",
		snippet: "Proofread before ship",
		timestamp: "14m",
		avatarUrl: AVATAR,
		hostKind: "task",
		hasUnresolvedReview: true,
		blocking: false,
		pinned: false,
		lastActiveAt: new Date(NOW - 14 * 60 * 1000).toISOString(),
	},
	{
		id: "c1",
		title: "Chat: standup recap",
		snippet: "Daily notes",
		timestamp: "1h",
		avatarUrl: AVATAR,
		hostKind: "task",
		hasUnresolvedReview: false,
		blocking: false,
		pinned: false,
		lastActiveAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
	},
	{
		id: "res1",
		title: "Mobile dark mode shipped",
		snippet: "Resolved 2h ago",
		timestamp: "2h",
		avatarUrl: AVATAR,
		hostKind: "task",
		hasUnresolvedReview: false,
		blocking: false,
		pinned: false,
		resolvedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
		lastActiveAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
	},
];

export const Populated = (): React.JSX.Element => (
	<div className="max-w-sm">
		<ThreadSections threads={SAMPLE} now={NOW} />
	</div>
);

export const Empty = (): React.JSX.Element => (
	<div className="max-w-sm">
		<ThreadSections threads={[]} now={NOW} />
	</div>
);

export const ActiveQuiet = (): React.JSX.Element => (
	<div className="max-w-sm">
		<ThreadSections threads={SAMPLE[0] ? [SAMPLE[0]] : []} now={NOW} />
	</div>
);

export const ErrorStateStory = (): React.JSX.Element => (
	<div className="max-w-sm">
		<ThreadSections threads={[]} now={NOW} errorMessage="HTTP 500" />
	</div>
);
