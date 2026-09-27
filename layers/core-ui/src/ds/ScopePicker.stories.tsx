import { useState } from "react";
import { ScopePicker, type ScopePickerOption, ScopePickerToggle } from "./ScopePicker.js";

export default {
	title: "ScopePicker",
	tier: "primitive" as const,
	order: [
		"FilterMode",
		"SelectMode",
		"WithDisabledOption",
		"Focused",
		"MobileTouchTarget",
		"Toggle",
	],
};

const SELECT_OPTIONS: ScopePickerOption[] = [
	{ id: "shared", label: "Shared" },
	{ id: "team", label: "Team" },
	{ id: "private", label: "Private" },
];

const FILTER_OPTIONS: ScopePickerOption[] = [
	{ id: "all", label: "All" },
	{ id: "shared", label: "Shared" },
	{ id: "team", label: "Team" },
	{ id: "private", label: "Private" },
];

export const FilterMode = (): React.JSX.Element => {
	const [value, setValue] = useState<string | null>(null);
	return (
		<ScopePicker
			options={FILTER_OPTIONS}
			value={value}
			onChange={setValue}
			mode="filter"
			ariaLabel="Filter by scope"
			testIdPrefix="scope-pill"
			dataTestId="document-scope-pills"
		/>
	);
};

export const SelectMode = (): React.JSX.Element => {
	const [value, setValue] = useState<string | null>("shared");
	return (
		<ScopePicker
			options={SELECT_OPTIONS}
			value={value}
			onChange={setValue}
			ariaLabel="Scope"
			testIdPrefix="scope-pill-create"
		/>
	);
};

export const WithDisabledOption = (): React.JSX.Element => {
	const [value, setValue] = useState<string | null>("shared");
	return (
		<ScopePicker
			options={[
				{ id: "shared", label: "Shared" },
				{ id: "team", label: "Team", disabled: true },
				{ id: "private", label: "Private" },
			]}
			value={value}
			onChange={setValue}
			ariaLabel="Scope"
			testIdPrefix="scope-pill-create"
			disabledTitle="Join a team to use team-scoped documents"
		/>
	);
};

export const Focused = (): React.JSX.Element => (
	<div className="text-[13px] text-[var(--text-secondary)] flex flex-col gap-[9px]">
		<span>Tab into the pills to see the focus-visible ring (latent a11y fix).</span>
		<ScopePicker
			options={SELECT_OPTIONS}
			value="shared"
			onChange={() => undefined}
			ariaLabel="Scope"
			testIdPrefix="scope-pill-create"
		/>
	</div>
);

// The same pill look as the scope pills, but as a real aria-pressed toggle —
// for a standalone boolean filter (e.g. DocumentList's "Memories" chip)
// rather than a member of a radiogroup.
export const Toggle = (): React.JSX.Element => {
	const [pressed, setPressed] = useState(false);
	return (
		<ScopePickerToggle label="Memories" pressed={pressed} onToggle={() => setPressed((v) => !v)} />
	);
};

export const MobileTouchTarget = (): React.JSX.Element => (
	<div style={{ width: "1024px", maxWidth: "100%" }}>
		<p className="text-[13px] text-[var(--text-secondary)] mb-[9px]">
			At ≤1024px each pill is ≥44px tall (AQ-015 floor); ≥1280px it returns to the dense 24px.
		</p>
		<ScopePicker
			options={SELECT_OPTIONS}
			value="team"
			onChange={() => undefined}
			ariaLabel="Scope"
			testIdPrefix="scope-pill-create"
		/>
	</div>
);
