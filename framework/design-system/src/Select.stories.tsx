/**
 * Select stories — AG5 extended API: size, placeholder, options[].disabled, width.
 */

import type { JSX } from "react";
import { Select } from "./Select.js";

export default { title: "Select" };

const OPTIONS = [
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
	{ value: "system", label: "System" },
];

export function Default(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Select options={OPTIONS} />
			<Select label="Theme" options={OPTIONS} />
			<Select label="Theme" options={OPTIONS} disabled />
		</div>
	);
}

export function Sizes(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<div>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">md (default)</p>
				<Select options={OPTIONS} size="md" />
			</div>
			<div>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">sm (settings rows)</p>
				<Select options={OPTIONS} size="sm" />
			</div>
		</div>
	);
}

export function WithPlaceholder(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Select options={OPTIONS} placeholder="Choose a theme…" />
			<Select options={OPTIONS} size="sm" placeholder="Select one…" />
		</div>
	);
}

export function FullWidthVsFixed(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px] max-w-[400px]">
			<div>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">
					Full width (default — no className)
				</p>
				<Select options={OPTIONS} />
			</div>
			<div>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">
					Full width explicit (className="w-full")
				</p>
				<Select options={OPTIONS} className="w-full" />
			</div>
			<div>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">
					Fixed 88px (currency — className="w-[88px]")
				</p>
				<Select options={OPTIONS} size="sm" className="w-[88px]" />
			</div>
		</div>
	);
}

export function DisabledOption(): JSX.Element {
	const OPTIONS_WITH_DISABLED = [
		{ value: "", label: "-- no team --", disabled: true },
		{ value: "alpha", label: "Alpha Team" },
		{ value: "beta", label: "Beta Team" },
	];
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Select options={OPTIONS_WITH_DISABLED} />
			<Select options={OPTIONS_WITH_DISABLED} size="sm" />
		</div>
	);
}
