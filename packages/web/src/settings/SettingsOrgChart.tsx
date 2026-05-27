/**
 * SettingsOrgChart — Org Chart settings section.
 *
 * P4 Task 10: Settings section stubs (AC-12, AC-15)
 * Displays org chart configuration (team members, roles).
 */

import type { JSX } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser.js";

export function SettingsOrgChart(): JSX.Element {
	const { status } = useCurrentUser();

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3">
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-8 w-full" />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-[var(--text-mid)]">
				Org chart configuration is managed at the team level. Add agents and assign roles from the
				Work view.
			</p>
		</div>
	);
}
