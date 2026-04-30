import { ThreadRow } from "./ThreadRow";

export default {
	title: "ThreadRow",
	tier: "2" as const,
	uses: ["StatusChip", "Tag"],
	order: [
		"Default",
		"WithStatusAndTag",
		"Unread",
		"Blocking",
		"Selected",
		"Pinned",
		"WithHostTag",
		"BlockingSelected",
		"WithActions",
	],
};

export const Default = (): React.JSX.Element => (
	<ThreadRow
		avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23374151'/%3E%3Ctext x='16' y='20' text-anchor='middle' fill='white' font-size='14'%3E1%3C/text%3E%3C/svg%3E"
		title="Deploy pipeline stuck"
		snippet="The CI build has been hanging for 20 minutes..."
		timestamp="2 min ago"
	/>
);

export const WithStatusAndTag = (): React.JSX.Element => (
	<ThreadRow
		avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23065f46'/%3E%3Ctext x='16' y='20' text-anchor='middle' fill='white' font-size='14'%3E2%3C/text%3E%3C/svg%3E"
		title="Cost cap approaching"
		snippet="Agent session-42 is at 85% of its cost cap..."
		timestamp="5 min ago"
		status="blocked"
		tag="ops"
	/>
);

export const Unread = (): React.JSX.Element => (
	<ThreadRow
		avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23713f12'/%3E%3Ctext x='16' y='20' text-anchor='middle' fill='white' font-size='14'%3E3%3C/text%3E%3C/svg%3E"
		title="New pitch submitted"
		snippet="AI-Powered Onboarding has been submitted for review"
		timestamp="Just now"
		unread={true}
		status="healthy"
	/>
);

export const Blocking = (): React.JSX.Element => (
	<ThreadRow
		avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23991b1b'/%3E%3Ctext x='16' y='20' text-anchor='middle' fill='white' font-size='14'%3EB%3C/text%3E%3C/svg%3E"
		title="Agent blocked on API key"
		snippet="Cannot proceed without credentials..."
		timestamp="5 min ago"
		status="blocked"
		blocking={true}
		kind="review"
	/>
);

export const Selected = (): React.JSX.Element => (
	<ThreadRow
		avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23065f46'/%3E%3C/svg%3E"
		title="Pricing experiment — week 2"
		snippet="Conversion up 8% on the $29 tier"
		timestamp="1h"
		selected={true}
		hostTag="bet"
	/>
);

export const Pinned = (): React.JSX.Element => (
	<ThreadRow
		avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%2327272b'/%3E%3C/svg%3E"
		title="Chief of Staff — weekly reflection"
		snippet="3 patterns surfaced from last week's bets"
		timestamp="2h"
		pinned={true}
		hostTag="user"
	/>
);

export const WithHostTag = (): React.JSX.Element => (
	<ThreadRow
		avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%231e3a8a'/%3E%3C/svg%3E"
		title="Migration script review"
		snippet="Two paths considered — picking one"
		timestamp="3h"
		hostTag="task"
	/>
);

export const BlockingSelected = (): React.JSX.Element => (
	<ThreadRow
		avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23991b1b'/%3E%3C/svg%3E"
		title="API key needed for Stripe"
		snippet="Builder cannot proceed without credentials"
		timestamp="8m"
		blocking={true}
		selected={true}
		hostTag="task"
	/>
);

export const WithActions = (): React.JSX.Element => (
	<ThreadRow
		avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23581c87'/%3E%3Ctext x='16' y='20' text-anchor='middle' fill='white' font-size='14'%3E4%3C/text%3E%3C/svg%3E"
		title="Session completed"
		snippet="Builder agent finished implementing login flow"
		timestamp="1 hour ago"
		status="done"
		actions={
			<button type="button" className="btn btn-xs btn-ghost">
				View
			</button>
		}
	/>
);
