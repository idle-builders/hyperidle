/**
 * Combobox — general catalog(+custom) / async-search picker.
 *
 * Populated real state only (no empty/loading skeletons invented) per
 * feedback_no_skeleton_error_in_initial_designs, except the AsyncSearch
 * story's loading row, which IS the real state a search-in-flight renders.
 */

import { useState } from "react";
import { Combobox, type ComboboxOption } from "./Combobox.js";

export default {
	title: "Combobox",
};

const ROLES: readonly ComboboxOption[] = [
	{
		id: "builder",
		label: "Builder",
		description: "Engineer. Implements features, writes code, tests, deploys.",
	},
	{
		id: "designer",
		label: "Designer",
		description: "Product designer. UX research, interaction & visual design.",
	},
	{
		id: "product_manager",
		label: "Product Manager",
		description: "Team lead. Shapes pitches, coordinates cycles, decomposes bets.",
	},
	{
		id: "qa_engineer",
		label: "QA Engineer",
		description: "Quality assurance. Test plans, regression, bug triage.",
	},
];

const TASKS: readonly ComboboxOption[] = [
	{ id: "task-a1b2c3", label: "Ship the search picker" },
	{ id: "task-d4e5f6", label: "Write the release notes" },
	{ id: "task-g7h8i9", label: "Onboarding checklist (nested)" },
];

/** Static catalog, closed field with a known value selected. */
export function KnownValueSelected(): React.JSX.Element {
	const [role, setRole] = useState("designer");
	return (
		<div className="w-[360px] p-[24px]">
			<Combobox
				label="Role"
				options={ROLES}
				value={role}
				onChange={setRole}
				allowCustomValue
				placeholder="Filter roles or type a new one…"
				listAriaLabel="Roles"
				customValuePrefix="Use new role: "
			/>
		</div>
	);
}

/**
 * Open popover with a non-matching typed query — shows the catalog AND the
 * pinned "Use new role: …" custom-value affordance.
 */
export function OpenWithCustomAffordance(): React.JSX.Element {
	const [role, setRole] = useState("builder");
	return (
		<div className="flex flex-col gap-[18px]">
			<div className="w-[360px] p-[24px]">
				<Combobox
					label="Role"
					options={ROLES}
					value={role}
					onChange={setRole}
					allowCustomValue
					placeholder="Filter roles or type a new one…"
					listAriaLabel="Roles"
					customValuePrefix="Use new role: "
				/>
			</div>
			<p className="type-metadata text-[var(--text-tertiary)]">
				Click the field, then type e.g. “Release Manager” to see the “Use new role” affordance.
			</p>
		</div>
	);
}

/**
 * Server-driven mode: the caller owns the options (an async search result)
 * and the closed trigger never shows a selection — each pick hands off to a
 * chip list the caller owns, the way `TaskDependencyField` uses it.
 */
export function AsyncSearch(): React.JSX.Element {
	const [options, setOptions] = useState<readonly ComboboxOption[]>([]);
	const [loading, setLoading] = useState(false);
	const [picked, setPicked] = useState<string | null>(null);

	function handleQueryChange(query: string): void {
		if (query.trim() === "") {
			setOptions([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		setTimeout(() => {
			setOptions(TASKS.filter((t) => t.label.toLowerCase().includes(query.trim().toLowerCase())));
			setLoading(false);
		}, 300);
	}

	return (
		<div className="flex flex-col gap-[12px]">
			<div className="w-[360px] p-[24px]">
				<Combobox
					options={options}
					onChange={setPicked}
					onQueryChange={handleQueryChange}
					loading={loading}
					placeholder="Search tasks by title…"
					inputAriaLabel="Search tasks by title"
					listAriaLabel="Matching tasks"
					emptyMessage="No matching tasks"
				/>
			</div>
			{picked && (
				<p className="px-[24px] text-[12px] text-[var(--text-tertiary)]">Picked: {picked}</p>
			)}
		</div>
	);
}

/** Disabled — the field cannot be opened or edited. */
export function Disabled(): React.JSX.Element {
	return (
		<div className="w-[360px] p-[24px]">
			<Combobox
				label="Role"
				options={[
					...ROLES,
					{ id: "assistant", label: "Assistant", description: "Your personal assistant." },
				]}
				value="assistant"
				onChange={() => {}}
				disabled
			/>
		</div>
	);
}
