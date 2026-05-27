/**
 * SettingsAppearance — Appearance settings section.
 *
 * P4 Task 10: Settings section stubs (AC-12, AC-18, AC-26)
 * Manages density and theme preferences with localStorage persistence.
 * AC-26: density persists via useDensity hook.
 */

import { type JSX, useCallback } from "react";
import type { Density } from "../components/SettingsPanel.js";
import { useDensity } from "../hooks/useDensity.js";
import { useTheme } from "../hooks/useTheme.js";
import { useToast } from "../shell/ToastRegion.js";

const DENSITY_OPTIONS: Array<{ value: Density; label: string }> = [
	{ value: "auto", label: "Auto" },
	{ value: "compact", label: "Compact" },
	{ value: "default", label: "Default" },
	{ value: "comfortable", label: "Comfortable" },
];

export function SettingsAppearance(): JSX.Element {
	const { density, setDensity } = useDensity();
	const { theme, setTheme } = useTheme();
	const { showToast } = useToast();

	const handleDensityChange = useCallback(
		(value: Density): void => {
			setDensity(value);
			showToast("Appearance saved");
		},
		[setDensity, showToast],
	);

	const handleThemeChange = useCallback(
		(value: "light" | "dark" | "system"): void => {
			setTheme(value);
			showToast("Appearance saved");
		},
		[setTheme, showToast],
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="form-control">
				<label className="label" htmlFor="density-select">
					<span className="label-text text-[var(--text-mid)]">Density</span>
				</label>
				<select
					id="density-select"
					className="select select-sm select-bordered w-full"
					value={density}
					onChange={(e) => handleDensityChange(e.target.value as Density)}
					aria-label="Density"
				>
					{DENSITY_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</div>

			<div className="form-control">
				<label className="label" htmlFor="theme-select">
					<span className="label-text text-[var(--text-mid)]">Theme</span>
				</label>
				<select
					id="theme-select"
					className="select select-sm select-bordered w-full"
					value={theme}
					onChange={(e) => handleThemeChange(e.target.value as "light" | "dark" | "system")}
					aria-label="Theme"
				>
					<option value="light">Light</option>
					<option value="dark">Dark</option>
					<option value="system">System</option>
				</select>
			</div>
		</div>
	);
}
