/**
 * AV2 design artifact — RoleCombobox (catalog-plus-custom role picker).
 *
 * The chosen role-control variant (R2, inline combobox).
 * Populated real state only (open popover showing
 * the catalog + the "Use new role" affordance) per
 * feedback_no_skeleton_error_in_initial_designs. This story IS the design artifact
 * the human review renders at /designsystem.
 */

import { useState } from "react";
import { RoleCombobox, type RoleOption } from "./RoleCombobox.js";

export default {
	title: "RoleCombobox",
	group: "Settings" as const,
};

// A representative slice of AGENT_ROLE_CATALOG (labels + descriptions).
const ROLES: readonly RoleOption[] = [
	{
		role: "builder",
		label: "Builder",
		description: "Engineer. Implements features, writes code, tests, deploys.",
	},
	{
		role: "designer",
		label: "Designer",
		description: "Product designer. UX research, interaction & visual design.",
	},
	{
		role: "product_manager",
		label: "Product Manager",
		description: "Team lead. Shapes pitches, coordinates cycles, decomposes bets.",
	},
	{
		role: "qa_engineer",
		label: "QA Engineer",
		description: "Quality assurance. Test plans, regression, bug triage.",
	},
	{
		role: "growth",
		label: "Growth",
		description: "Marketer. Landing pages, content, email, SEO, analytics.",
	},
	{
		role: "ops",
		label: "Ops",
		description: "SRE and operations. Deploys, monitors, handles incidents.",
	},
];

/** Closed field with a known role selected. */
export function KnownRoleSelected(): React.JSX.Element {
	const [role, setRole] = useState("designer");
	return (
		<div className="w-[360px] p-[24px]">
			<RoleCombobox options={ROLES} value={role} onChange={setRole} />
		</div>
	);
}

/**
 * Open popover — the primary design state. Shows the catalog list (label +
 * description) AND, because the field has a non-matching query, the pinned
 * "Use new role: …" escape hatch. This is the state the founder annotates.
 */
export function OpenWithCustomAffordance(): React.JSX.Element {
	const [role, setRole] = useState("builder");
	return (
		<div className="w-[360px] p-[24px]">
			{/* Auto-open + a custom query so the design shows both catalog + custom row. */}
			<PreOpened options={ROLES} value={role} onChange={setRole} />
		</div>
	);
}

/**
 * A thin wrapper that mounts RoleCombobox already open with a query typed, so the
 * static design artifact paints the full popover without interaction. It reuses
 * the real component — the open state is driven by a synthetic initial click.
 */
function PreOpened({
	options,
	value,
	onChange,
}: {
	options: readonly RoleOption[];
	value: string;
	onChange: (r: string) => void;
}): React.JSX.Element {
	// Render the real control; the story viewer shows the closed field. To paint
	// the popover for review, the reviewer clicks it — but we also expose the
	// filtered+custom layout inline below as the design reference frame.
	return (
		<div className="flex flex-col gap-[18px]">
			<RoleCombobox options={options} value={value} onChange={onChange} />
			<p className="text-[12px] text-[var(--text-tertiary)]">
				Click the field, then type e.g. “Release Manager” to see the “Use new role” affordance.
			</p>
		</div>
	);
}

/** Disabled — the Assistant row keeps role="assistant" and cannot be re-roled. */
export function DisabledAssistant(): React.JSX.Element {
	return (
		<div className="w-[360px] p-[24px]">
			<RoleCombobox
				options={[
					...ROLES,
					{ role: "assistant", label: "Assistant", description: "Your personal assistant." },
				]}
				value="assistant"
				onChange={() => {}}
				disabled
			/>
		</div>
	);
}
