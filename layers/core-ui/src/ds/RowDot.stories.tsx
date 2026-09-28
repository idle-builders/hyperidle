import type React from "react";
import { RowDot } from "./RowDot.js";

export default { title: "RowDot" };

export const Success = (): React.JSX.Element => (
	<div className="flex items-center gap-[12px] p-[12px]">
		<RowDot tone="success" label="Healthy" />
		<span className="text-[13px]">success</span>
	</div>
);

export const Warning = (): React.JSX.Element => (
	<div className="flex items-center gap-[12px] p-[12px]">
		<RowDot tone="warning" label="Degraded" />
		<span className="text-[13px]">warning</span>
	</div>
);

export const ErrorTone = (): React.JSX.Element => (
	<div className="flex items-center gap-[12px] p-[12px]">
		<RowDot tone="error" label="Down" />
		<span className="text-[13px]">error</span>
	</div>
);

export const Info = (): React.JSX.Element => (
	<div className="flex items-center gap-[12px] p-[12px]">
		<RowDot tone="info" label="Informational" />
		<span className="text-[13px]">info</span>
	</div>
);

export const Neutral = (): React.JSX.Element => (
	<div className="flex items-center gap-[12px] p-[12px]">
		<RowDot tone="neutral" />
		<span className="text-[13px]">neutral (decorative, aria-hidden)</span>
	</div>
);

export const AllTones = (): React.JSX.Element => (
	<div className="flex flex-col gap-[6px] p-[12px]">
		{(["success", "warning", "error", "info", "neutral"] as const).map((tone) => (
			<div key={tone} className="flex items-center gap-[12px]">
				<RowDot tone={tone} label={tone !== "neutral" ? tone : undefined} />
				<span className="text-[12px] text-[var(--text-secondary)]">{tone}</span>
			</div>
		))}
	</div>
);
