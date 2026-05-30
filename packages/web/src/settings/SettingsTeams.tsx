/**
 * SettingsTeams — Teams settings section.
 *
 * P4 Task 10: Settings section (AC-12, AC-18)
 * Lists teams with active/archived toggle.
 *
 * Toggling calls PATCH /api/products/:id to update phase (build ↔ archived).
 * Active teams are those with phase !== "archived".
 *
 * @lore U1: Renamed from SettingsProducts. `products` → `teams`, `ProductSetting` → `TeamSetting`.
 */

import { type JSX, useCallback, useState } from "react";
import { useSettings } from "../hooks/useSettings.js";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";
import type { TeamSetting } from "./settings-types.js";

export function SettingsTeams(): JSX.Element {
	const { settings, status } = useSettings();
	const { showToast } = useToast();
	// Local team state for optimistic updates
	const [localTeams, setLocalTeams] = useState<TeamSetting[] | null>(null);
	const [togglingId, setTogglingId] = useState<string | null>(null);

	// Initialize local state from loaded settings
	const sourceTeams = settings?.teams ?? null;
	if (localTeams === null && sourceTeams !== null) {
		setLocalTeams(sourceTeams);
	}

	const handleToggle = useCallback(
		async (teamId: string, currentlyActive: boolean): Promise<void> => {
			// Optimistically update
			const newPhase = currentlyActive ? "archived" : "build";
			setLocalTeams((prev) =>
				prev ? prev.map((t) => (t.id === teamId ? { ...t, active: !currentlyActive } : t)) : prev,
			);
			setTogglingId(teamId);
			try {
				const res = await apiFetch(`/api/products/${encodeURIComponent(teamId)}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ phase: newPhase }),
				});
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}
				showToast(`Team ${currentlyActive ? "archived" : "activated"}`);
			} catch {
				// Revert on failure
				setLocalTeams((prev) =>
					prev ? prev.map((t) => (t.id === teamId ? { ...t, active: currentlyActive } : t)) : prev,
				);
				showToast("Failed to update team");
			} finally {
				setTogglingId(null);
			}
		},
		[showToast],
	);

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3">
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-8 w-full" />
			</div>
		);
	}

	if (status === "error" || !settings) {
		return <p className="text-sm text-error">Failed to load teams. Please try again.</p>;
	}

	const teams = localTeams ?? settings.teams;

	if (teams.length === 0) {
		return (
			<p className="text-sm text-[var(--text-lo)]">
				No teams configured. Add teams from the Work view.
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-2">
			{teams.map((team) => (
				<li key={team.id} className="flex items-center justify-between gap-2 text-sm">
					<span className="text-[var(--text-hi)]">{team.name}</span>
					<input
						type="checkbox"
						className="toggle toggle-sm toggle-primary"
						checked={team.active}
						onChange={() => handleToggle(team.id, team.active)}
						disabled={togglingId === team.id}
						aria-label={`Toggle ${team.name} active`}
					/>
				</li>
			))}
		</ul>
	);
}
