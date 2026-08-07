import { NotificationRow } from "./NotificationRow";

export default {
	title: "NotificationRow",
	tier: "2" as const,
	uses: ["StatusChip", "Tag"],
	order: ["Healthy", "ErrorSeverity", "WithInlineAction", "AllSeverities"],
};

export const Healthy = (): React.JSX.Element => (
	<NotificationRow
		severity="healthy"
		message="Deploy completed successfully"
		timestamp="Just now"
		source="CI/CD"
	/>
);

export const ErrorSeverity = (): React.JSX.Element => (
	<NotificationRow
		severity="error"
		message="Agent session crashed unexpectedly"
		timestamp="2 min ago"
		source="Runtime"
	/>
);

export const WithInlineAction = (): React.JSX.Element => (
	<NotificationRow
		severity="blocked"
		message="Agent blocked — awaiting API key"
		timestamp="2m ago"
		source="builder-agent"
		actions={
			<button type="button" className="btn btn-ghost btn-xs">
				Resolve
			</button>
		}
	/>
);

export const AllSeverities = (): React.JSX.Element => (
	<div className="flex flex-col gap-1">
		<NotificationRow severity="healthy" message="All systems operational" timestamp="now" />
		<NotificationRow
			severity="behind"
			message="Build is taking longer than expected"
			timestamp="5m ago"
			source="CI"
		/>
		<NotificationRow
			severity="blocked"
			message="Cannot reach external API"
			timestamp="10m ago"
			source="API"
		/>
		<NotificationRow severity="paused" message="Agent session paused by user" timestamp="15m ago" />
		<NotificationRow severity="done" message="Migration completed" timestamp="1h ago" source="DB" />
		<NotificationRow
			severity="error"
			message="Critical failure in pipeline"
			timestamp="2h ago"
			source="Pipeline"
		/>
	</div>
);
