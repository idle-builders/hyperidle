import type { JSX } from "react";

export type Status = "healthy" | "behind" | "blocked" | "paused" | "done" | "error";

export interface StatusChipProps {
	/**
	 * Runtime value. Typed as `Status` at the call site for compile-time
	 * safety, but at runtime we tolerate `undefined` / unknown strings
	 * (e.g. server/web version skew where a new shared status hasn't been
	 * mapped yet) and render a neutral "unknown" chip instead of letting
	 * an undefined class leak into the DOM as `badge undefined`.
	 * See I4 adversary W4.
	 */
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

const KNOWN_STATUSES: ReadonlySet<string> = new Set<Status>([
	"healthy",
	"behind",
	"blocked",
	"paused",
	"done",
	"error",
]);

export function StatusChip({ status }: StatusChipProps): JSX.Element {
	// I4 adversary W4: defensive — the caller may pass an undefined or
	// unknown string at runtime (server/web version skew, all-malformed
	// search rows slipping through a caller's filter). Never emit
	// `badge undefined`; render a neutral "unknown" chip instead.
	const safeStatus: Status | "unknown" =
		typeof status === "string" && KNOWN_STATUSES.has(status) ? (status as Status) : "unknown";

	if (safeStatus === "unknown") {
		return (
			<span
				className="badge badge-neutral badge-sm gap-1.5 font-mono text-xs uppercase"
				title="unknown"
				data-status="unknown"
			>
				<span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-content" />
				UNKNOWN
			</span>
		);
	}

	const badgeClass = STATUS_BADGE_CLASS[safeStatus];
	const dotClass = STATUS_DOT_CLASS[safeStatus];

	return (
		<span
			className={`badge ${badgeClass} badge-sm gap-1.5 font-mono text-xs uppercase`}
			title={safeStatus}
		>
			<span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
			{safeStatus.toUpperCase()}
		</span>
	);
}
