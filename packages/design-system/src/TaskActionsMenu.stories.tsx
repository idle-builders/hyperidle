import { TaskActionsMenu } from "./TaskActionsMenu";
import { TaskCard } from "./TaskCard";

const noop = (): void => {};
const handlers = {
	onRequestStateChange: noop,
	onCancelPendingRequest: noop,
	onOpenThread: noop,
	onReplyInThread: noop,
	onSnooze24h: noop,
	onCopyLink: noop,
};

export default {
	title: "TaskActionsMenu",
	tier: "2" as const,
	uses: ["TaskCard"],
	order: ["InProgress", "Accepted", "Blocked", "Review", "PendingRequest"],
};

export const InProgress = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskActionsMenu
			task={{ id: "t1", title: "Implement login", state: "in_progress" }}
			{...handlers}
		>
			<TaskCard title="Implement login" owner="Bob" state="in_progress" cost="$1.50" />
		</TaskActionsMenu>
	</div>
);

export const Accepted = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskActionsMenu task={{ id: "t1", title: "Plan release", state: "accepted" }} {...handlers}>
			<TaskCard title="Plan release" owner="Alice" state="accepted" />
		</TaskActionsMenu>
	</div>
);

export const Blocked = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskActionsMenu task={{ id: "t1", title: "Fix CI", state: "blocked" }} {...handlers}>
			<TaskCard title="Fix CI" owner="Carol" state="blocked" />
		</TaskActionsMenu>
	</div>
);

export const Review = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskActionsMenu task={{ id: "t1", title: "Pricing decision", state: "review" }} {...handlers}>
			<TaskCard title="Pricing decision" owner="Dave" state="review" />
		</TaskActionsMenu>
	</div>
);

export const PendingRequest = (): React.JSX.Element => {
	const pending = {
		messageId: "m-1",
		verb: "request_stop" as const,
		createdAt: "2026-04-19T12:00:00Z",
	};
	return (
		<div className="max-w-[320px]">
			<TaskActionsMenu
				task={{ id: "t1", title: "Implement login", state: "in_progress", pendingRequest: pending }}
				{...handlers}
			>
				<TaskCard
					title="Implement login"
					owner="Bob"
					state="in_progress"
					pendingRequest={pending}
				/>
			</TaskActionsMenu>
		</div>
	);
};
