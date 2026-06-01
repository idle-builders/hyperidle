/**
 * SettingsAppearance — Appearance settings section.
 *
 * P4 Task 10: Settings section stubs (AC-12, AC-18, AC-26)
 * Manages theme preference with localStorage persistence.
 *
 * @lore R9: Density toggle removed per R9 action prominence audit. Hearth uses a
 * single default density. The auto-density system (AQ-016) still functions at
 * narrow viewports — only the manual user control is removed.
 */

import { type JSX, useCallback } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useToast } from "../shell/ToastRegion.js";

export function SettingsAppearance(): JSX.Element {
	const { theme, setTheme } = useTheme();
	const { showToast } = useToast();

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
				<label className="label" htmlFor="theme-select">
					<span className="label-text text-[var(--text-secondary)]">Theme</span>
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
