import { ThreadRow } from "./ThreadRow";

export default {
	title: "ThreadRow",
	order: ["Default", "WithStatusAndTag", "Unread", "Blocking", "WithActions"],
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
