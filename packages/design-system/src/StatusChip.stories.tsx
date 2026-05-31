import { StatusChip } from "./StatusChip.js";

export default {
	title: "StatusChip",
	tier: "1" as const,
	order: ["AllStatusVariants", "UnknownFallback", "InContextDemoCard"],
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

export const UnknownFallback = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-2">
		{/* Runtime tolerance: unknown strings and undefined fall back to a neutral chip */}
		<StatusChip status={"unknown" as "healthy"} />
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
