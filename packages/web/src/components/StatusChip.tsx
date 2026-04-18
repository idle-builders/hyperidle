import type { JSX } from "react";

export type Status = "healthy" | "behind" | "blocked" | "paused" | "done" | "error";

export interface StatusChipProps {
	status: Status;
}

/**
 * @lore I4 S7: `blocked` and `error` were both `badge-error` (red),
 * indistinguishable to the user. `blocked` is now `badge-warning` (yellow):
 * blocked = "stuck waiting" (recoverable), error = "broken" (intervention
 * required). Both still grab attention but encode different urgency.
 */
const STATUS_BADGE_CLASS: Record<Status, string> = {
	healthy: "badge-accent",
	behind: "badge-secondary",
	blocked: "badge-warning",
	paused: "badge-neutral",
	done: "badge-success",
	error: "badge-error",
};

const STATUS_DOT_CLASS: Record<Status, string> = {
	healthy: "bg-accent",
	behind: "bg-secondary",
	blocked: "bg-warning",
	paused: "bg-neutral-content",
	done: "bg-success",
	error: "bg-error",
};

export function StatusChip({ status }: StatusChipProps): JSX.Element {
	const badgeClass = STATUS_BADGE_CLASS[status];
	const dotClass = STATUS_DOT_CLASS[status];

	return (
		<span
			className={`badge ${badgeClass} badge-sm gap-1.5 font-mono text-xs uppercase`}
			title={status}
		>
			<span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
			{status.toUpperCase()}
		</span>
	);
}
