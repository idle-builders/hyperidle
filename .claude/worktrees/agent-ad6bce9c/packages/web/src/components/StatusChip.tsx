import type { JSX } from "react";

export type Status = "healthy" | "behind" | "blocked" | "paused" | "done" | "error";

export interface StatusChipProps {
	status: Status;
}

const STATUS_BADGE_CLASS: Record<Status, string> = {
	healthy: "badge-accent",
	behind: "badge-secondary",
	blocked: "badge-error",
	paused: "badge-neutral",
	done: "badge-success",
	error: "badge-error",
};

const STATUS_DOT_CLASS: Record<Status, string> = {
	healthy: "bg-accent",
	behind: "bg-secondary",
	blocked: "bg-error",
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
