/**
 * SettingsAppearance — Appearance settings section.
 *
 * W2: Density system removed. Only theme preference remains.
 * @lore W2: Density selector removed per AESTHETICS.md AQ-003 ("One size per
 * component — There is no density system"). The density system
 * (hooks, [data-density] tokens) was completely removed in W2.
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
