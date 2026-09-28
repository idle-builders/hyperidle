// hearth-internal-padding

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ToggleProps {
	on?: boolean;
	label: string;
	labelHidden?: boolean;
	description?: string;
	onChange?: (on: boolean) => void;
	disabled?: boolean;
}

export function Toggle({
	on = false,
	label,
	labelHidden = false,
	description,
	onChange,
	disabled = false,
}: ToggleProps): JSX.Element {
	if (labelHidden) {
		return (
			<span
				{...dsProps("Toggle", "0")}
				data-variant="label-hidden"
				className={`inline-flex items-center ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
			>
				<button
					type="button"
					role="switch"
					aria-checked={on}
					aria-label={label}
					disabled={disabled}
					onClick={() => onChange?.(!on)}
					className={[
						"relative inline-flex shrink-0 h-[24px] w-[44px] items-center rounded-[var(--r-pill)]",
						"",
						"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
						on
							? "bg-[var(--accent-primary)] border-[var(--accent-primary)]"
							: "bg-[var(--border-default)] border-[var(--border-default)]",
					].join(" ")}
				>
					{/* Thumb */}
					<span
						data-az16-profile="spring"
						className={`motion-spring ${[
							"absolute top-[2px] h-[18px] w-[18px] rounded-[var(--r-pill)]",
							"bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]",
							"",
							"",
							on ? "translate-x-[22px]" : "translate-x-[2px]",
						].join(" ")}`}
					/>
				</button>
				<span className="sr-only">{label}</span>
			</span>
		);
	}

	// Default labeled variant
	return (
		<label
			{...dsProps("Toggle", "0")}
			className={`flex items-start gap-[9px] cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
		>
			{/* Track */}
			<button
				type="button"
				role="switch"
				aria-checked={on}
				aria-label={label}
				disabled={disabled}
				onClick={() => onChange?.(!on)}
				className={[
					"relative inline-flex shrink-0 h-[24px] w-[44px] items-center rounded-[var(--r-pill)]",
					"",
					"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
					on
						? "bg-[var(--accent-primary)] border-[var(--accent-primary)]"
						: "bg-[var(--border-default)] border-[var(--border-default)]",
				].join(" ")}
			>
				{/* Thumb */}
				<span
					data-az16-profile="spring"
					className={`motion-spring ${[
						"absolute top-[2px] h-[18px] w-[18px] rounded-[var(--r-pill)]",
						"bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]",
						"",
						"",
						on ? "translate-x-[22px]" : "translate-x-[2px]",
					].join(" ")}`}
				/>
			</button>
			{/* Text */}
			<div className="flex flex-col" style={{ gap: "2px" }}>
				<span className="type-small   text-[var(--text-primary)] ">{label}</span>
				{description && (
					<span className="type-metadata  text-[var(--text-tertiary)] ">{description}</span>
				)}
			</div>
		</label>
	);
}
