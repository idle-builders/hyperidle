import type { ThreadItem } from "./ThreadSections";
import { ThreadSections } from "./ThreadSections";

export default { title: "ThreadSections" };

const AVATAR =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23374151'/%3E%3C/svg%3E";

const SAMPLE: ThreadItem[] = [
	{
		id: "p1",
		title: "Pinned cycle retro",
		snippet: "Keep this on top",
		timestamp: "pinned",
		avatarUrl: AVATAR,
		kind: "chat",
		blocking: false,
		pinned: true,
	},
	{
		id: "b1",
		title: "Blocking: prod outage review",
		snippet: "Waiting on rollback verdict",
		timestamp: "2m",
		avatarUrl: AVATAR,
		kind: "review",
		blocking: true,
		pinned: false,
		status: "blocked",
	},
	{
		id: "r1",
		title: "Review: onboarding copy pass",
		snippet: "Proofread before ship",
		timestamp: "14m",
		avatarUrl: AVATAR,
		kind: "review",
		blocking: false,
		pinned: false,
	},
	{
		id: "c1",
		title: "Chat: standup recap",
		snippet: "Daily notes",
		timestamp: "1h",
		avatarUrl: AVATAR,
		kind: "chat",
		blocking: false,
		pinned: false,
	},
];

export const Populated = (): React.JSX.Element => (
	<div className="max-w-sm">
		<ThreadSections threads={SAMPLE} />
	</div>
);

export const Empty = (): React.JSX.Element => (
	<div className="max-w-sm">
		<ThreadSections threads={[]} />
	</div>
);

export const BlockingOutranksKind = (): React.JSX.Element => (
	<div className="max-w-sm">
		<ThreadSections
			threads={[
				{
					id: "bc",
					title: "Blocking chat wins over a plain review",
					snippet: "...",
					timestamp: "3m",
					avatarUrl: AVATAR,
					kind: "chat",
					blocking: true,
					pinned: false,
				},
				{
					id: "r",
					title: "Plain review lands below",
					snippet: "...",
					timestamp: "3m",
					avatarUrl: AVATAR,
					kind: "review",
					blocking: false,
					pinned: false,
				},
			]}
		/>
	</div>
);
