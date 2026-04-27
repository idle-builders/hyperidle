/**
 * L3 — Routing filter chips: All / Mine / CEO / CPO.
 *
 * @lore L3 (CONFUSION-2): Lives inside the Conversations submenu's children
 * area, not in the Submenu chrome's filter slot. AppShell hides the J2 chip
 * row for the conversations view so we render exactly one filter row.
 *
 * @lore L3: When `me` is null (loading or unauthenticated) we hide the
 * entire chip bar — the filters depend on actor identity. The plan
 * originally proposed disabling chips; hiding is cleaner and matches the
 * test expectations.
 *
 * @lore L3 review (design D4 + W6): chip labels shortened to "All / Mine /
 * CEO / CPO" so all four fit a 240 px Submenu without wrapping. The
 * existing tablist semantics are preserved (test queries use
 * `getByRole("tab", …)`); accessible names carry the long form
 * ("Routed to CEO") for screen readers while the visible label is the
 * short form. `aria-pressed` parallels the toggle semantics that the
 * adversary review flagged — it is informational only since the role
 * supports `aria-selected`.
 *
 * @lore L3 review (design W7 + W8): selected chip uses an explicit border
 * + text-hi color so the dark-mode contrast is unambiguous. Chip size is
 * `btn-sm` so AQ-015's 44 px touch-target floor at viewport ≤ 1024 px is
 * met (btn-xs resolved to ~24 px).
 */
import type { Actor, RoutingFilter } from "@hyperidle/shared";
import type { JSX } from "react";

export interface RoutingFilterChipsProps {
	active: RoutingFilter;
	onChange: (next: RoutingFilter) => void;
	me: Actor | null;
}

interface ChipDef {
	id: RoutingFilter;
	label: string;
	ariaName: string;
}

const CHIPS: readonly ChipDef[] = [
	{ id: "all", label: "All", ariaName: "All" },
	{ id: "mine", label: "Mine", ariaName: "Mine" },
	{ id: "ceo", label: "CEO", ariaName: "Routed to CEO" },
	{ id: "cpo", label: "CPO", ariaName: "Routed to CPO" },
];

export function RoutingFilterChips({
	active,
	onChange,
	me,
}: RoutingFilterChipsProps): JSX.Element | null {
	if (me === null) return null;
	return (
		<div
			data-testid="routing-filter-chips"
			role="tablist"
			aria-label="Filter conversations by routing"
			className="flex flex-wrap gap-1"
		>
			{CHIPS.map((c) => {
				const selected = c.id === active;
				const baseClass = "btn btn-sm";
				const stateClass = selected
					? "btn-neutral text-[var(--text-hi)] border border-[var(--border-emphasis,var(--primary))]"
					: "btn-ghost text-[var(--text-mid)]";
				return (
					<button
						key={c.id}
						type="button"
						role="tab"
						aria-selected={selected}
						aria-label={c.ariaName}
						className={`${baseClass} ${stateClass}`}
						onClick={() => onChange(c.id)}
					>
						{c.label}
					</button>
				);
			})}
		</div>
	);
}
