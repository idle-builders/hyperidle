import { StatusChip } from "./StatusChip.js";

export default {
	title: "StatusChip",
	tier: "1" as const,
	order: ["AllStatusVariants", "WithLabelProp", "UnknownFallback", "InContextDemoCard"],
};

export const AllStatusVariants = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-2">
		<StatusChip status="healthy" />
		<StatusChip status="behind" />
		<StatusChip status="blocked" />
		<StatusChip status="paused" />
		<StatusChip status="done" />
		<StatusChip status="error" />
	</div>
);

/**
 * When `label` is provided it renders verbatim in DOM; CSS `uppercase` provides
 * visual casing. This is the AC1 contract: labels from shared registries come
 * in title-case, displayed as uppercase via CSS only.
 */
export const WithLabelProp = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-2">
		{/* BET_STATUS_LABEL values: title-case in DOM, uppercase visually */}
		<StatusChip status="healthy" label="Active" />
		<StatusChip status="paused" label="On hold" />
		<StatusChip status="done" label="Completed" />
		<StatusChip status="error" label="Killed" />
		{/* TASK_OUTCOME_VERDICT_LABEL */}
		<StatusChip status="healthy" label="Met" />
		<StatusChip status="behind" label="Rework" />
		<StatusChip status="paused" label="Partial" />
		<StatusChip status="error" label="Not met" />
	</div>
);

export const UnknownFallback = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-2">
		{/* Explicit "unknown" sentinel — no credential / absence-is-not-an-error. */}
		<StatusChip status="unknown" />
		{/* Runtime tolerance: undefined and unrecognised strings still fall back to neutral grey. */}
		<StatusChip status={undefined as unknown as "healthy"} />
		<StatusChip status={"some-new-status" as "healthy"} />
	</div>
);

export const InContextDemoCard = (): React.JSX.Element => (
	<div className="rounded-lg bg-[var(--surface-container)] p-4">
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<StatusChip status="healthy" />
				<span className="text-[13px] text-[var(--text-secondary)]">Agent is running normally</span>
			</div>
			<div className="flex items-center gap-2">
				<StatusChip status="blocked" />
				<span className="text-[13px] text-[var(--text-secondary)]">
					Waiting on external dependency
				</span>
			</div>
			<div className="flex items-center gap-2">
				<StatusChip status="error" />
				<span className="text-[13px] text-[var(--text-secondary)]">
					Build failed, needs intervention
				</span>
			</div>
		</div>
	</div>
);
