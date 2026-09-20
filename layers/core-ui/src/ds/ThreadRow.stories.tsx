import { ThreadRow } from "./ThreadRow";

export default {
	title: "ThreadRow",
	tier: "2" as const,
	uses: ["StatusChip", "Tag"],
	order: [
		"Default",
		"Unread",
		"UnreadWithAvatarsAndCount",
		"Blocking",
		"BlockingUnread",
		"ReadWithAvatarsAndCount",
		"Selected",
		"Pinned",
		"WithHostTag",
		"BlockingSelected",
		"WithActions",
		"WithAgentPresence",
	],
};

export const Default = (): React.JSX.Element => (
	<ThreadRow
		title="Deploy pipeline stuck"
		snippet="The CI build has been hanging for 20 minutes..."
		timestamp="2 min ago"
	/>
);

export const Unread = (): React.JSX.Element => (
	<ThreadRow
		title="New pitch submitted"
		snippet="AI-Powered Onboarding has been submitted for review"
		timestamp="Just now"
		unread={true}
	/>
);

export const UnreadWithAvatarsAndCount = (): React.JSX.Element => (
	<ThreadRow
		title="Passkey rollout plan — phase 1 scope"
		snippet="Atlas: Drafted 3-phase plan. Shadow enrollment starts Monday."
		timestamp="2:38 PM"
		unread={true}
		blocking={true}
		avatars={[{ initials: "TG" }, { initials: "AT", agent: true }]}
		messageCount={8}
	/>
);

export const ReadWithAvatarsAndCount = (): React.JSX.Element => (
	<div>
		<ThreadRow
			title="WebAuthn browser compatibility matrix"
			snippet="Atlas: Coverage across target browsers is 96.3%. Safari 16+ required."
			timestamp="11:05 AM"
			avatars={[{ initials: "AT", agent: true }]}
			messageCount={3}
		/>
		<ThreadRow
			title="Password deprecation timeline"
			snippet="Tobias: Let's target end of Q2. Need comms plan for existing users."
			timestamp="Yesterday"
			avatars={[{ initials: "TG" }, { initials: "MR" }, { initials: "AT", agent: true }]}
			messageCount={14}
		/>
	</div>
);

export const Blocking = (): React.JSX.Element => (
	<ThreadRow
		title="Agent blocked on API key"
		snippet="Cannot proceed without credentials..."
		timestamp="5 min ago"
		blocking={true}
		kind="review"
		avatars={[{ initials: "AT", agent: true }]}
		messageCount={2}
	/>
);

export const BlockingUnread = (): React.JSX.Element => (
	<ThreadRow
		title="Session migration risk assessment"
		snippet="Kim: We need to handle the 12k active sessions before switching..."
		timestamp="1:22 PM"
		unread={true}
		blocking={true}
		avatars={[{ initials: "KL" }, { initials: "JS" }]}
		messageCount={5}
	/>
);

export const Selected = (): React.JSX.Element => (
	<ThreadRow
		title="Pricing experiment — week 2"
		snippet="Conversion up 8% on the $29 tier"
		timestamp="1h"
		selected={true}
		hostTag="team"
		avatars={[{ initials: "TG" }]}
		messageCount={4}
	/>
);

export const Pinned = (): React.JSX.Element => (
	<ThreadRow
		title="System Agent — weekly reflection"
		snippet="3 patterns surfaced from last week's bets"
		timestamp="2h"
		pinned={true}
		hostTag="user"
		avatars={[{ initials: "TG" }]}
		messageCount={1}
	/>
);

export const WithHostTag = (): React.JSX.Element => (
	<ThreadRow
		title="Migration script review"
		snippet="Two paths considered — picking one"
		timestamp="3h"
		hostTag="team"
		avatars={[{ initials: "TG" }, { initials: "AT", agent: true }]}
		messageCount={6}
	/>
);

export const BlockingSelected = (): React.JSX.Element => (
	<ThreadRow
		title="API key needed for Stripe"
		snippet="Builder cannot proceed without credentials"
		timestamp="8m"
		blocking={true}
		selected={true}
		hostTag="team"
		avatars={[{ initials: "AT", agent: true }]}
		messageCount={3}
	/>
);

export const WithActions = (): React.JSX.Element => (
	<ThreadRow
		title="Session completed"
		snippet="Builder agent finished implementing login flow"
		timestamp="1 hour ago"
		status="done"
		avatars={[{ initials: "AT", agent: true }, { initials: "TG" }]}
		messageCount={7}
		actions={
			<button type="button" className="btn btn-xs btn-ghost">
				View
			</button>
		}
	/>
);

/** AE5: Agent presence dots on avatar chips — active (green), error (red), idle (absent). */
export const WithAgentPresence = (): React.JSX.Element => (
	<div>
		<ThreadRow
			title="Active agent session in progress"
			snippet="Aria is currently working on the task..."
			timestamp="Just now"
			avatars={[
				{ initials: "TG" },
				{ initials: "AR", agent: true, operationalStatus: "active" as const },
			]}
			messageCount={3}
		/>
		<ThreadRow
			title="Agent encountered an error"
			snippet="Atlas hit a blocker — human input needed"
			timestamp="5m ago"
			blocking={true}
			avatars={[
				{ initials: "AT", agent: true, operationalStatus: "error" as const },
				{ initials: "TG" },
			]}
			messageCount={1}
		/>
		<ThreadRow
			title="Idle agent — no active session"
			snippet="Scout is available but not currently running"
			timestamp="1h ago"
			avatars={[{ initials: "SC", agent: true, operationalStatus: "idle" as const }]}
			messageCount={2}
		/>
	</div>
);
