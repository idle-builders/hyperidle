/**
 * SettingsAppearance — Appearance settings section.
 *
 * W3 AC-50: Theme selector as visual swatch cards (not a <select>).
 * Three cards: Light, Dark, System. Clicking a card sets the theme.
 *
 * @lore W2: Density system removed. Only theme preference remains.
 * @lore W3: The <select> element replaced by swatch cards per approved mockup
 * (AC-50). Each card is a button with data-theme-option attribute for testing.
 */

// hearth-internal-padding
import { type CSSProperties, type JSX, useCallback } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useToast } from "../shell/ToastRegion.js";

type ThemeOption = "light" | "dark" | "system";

interface ThemeSwatch {
	value: ThemeOption;
	label: string;
	description: string;
}

const THEME_OPTIONS: ThemeSwatch[] = [
	{ value: "light", label: "Light", description: "Light warm tones" },
	{ value: "dark", label: "Dark", description: "Dark warm tones" },
	{ value: "system", label: "System", description: "Match OS setting" },
];

/**
 * Returns an inline style object for the color swatch preview area at the top of
 * each theme card. Avoids hardcoded colors where possible by using CSS variables,
 * but the dark/light preview surfaces need fixed values since CSS variables resolve
 * to the active theme — not the theme being previewed.
 *
 * @lore W3 AC-50: CSS variables like var(--bg-canvas) resolve to the CURRENT theme,
 * so they cannot be used to preview an inactive theme. Fixed warm-toned values
 * (matching the Hearth light/dark palette) are used here intentionally.
 */
function swatchStyle(value: ThemeOption): CSSProperties {
	switch (value) {
		case "light":
			// Hearth light canvas: warm cream
			return { background: "#faf8f5" };
		case "dark":
			// Hearth dark canvas: warm near-black
			return { background: "#1c1a17" };
		case "system":
			// Diagonal split of light + dark to represent "follows OS"
			return { background: "linear-gradient(135deg, #faf8f5 50%, #1c1a17 50%)" };
	}
}

export function SettingsAppearance(): JSX.Element {
	const { theme, setTheme } = useTheme();
	const { showToast } = useToast();

	const handleThemeChange = useCallback(
		(value: ThemeOption): void => {
			setTheme(value);
			showToast("Appearance saved");
		},
		[setTheme, showToast],
	);

	return (
		<div className="flex flex-col gap-3">
			<span className="text-[12px] text-[var(--text-secondary)]">Theme</span>
			<div className="flex items-center gap-3 flex-wrap">
				{THEME_OPTIONS.map((option) => {
					const isActive = theme === option.value;
					return (
						<button
							key={option.value}
							type="button"
							data-theme-option={option.value}
							aria-pressed={isActive}
							aria-label={`${option.label} theme`}
							className={[
								"flex flex-col gap-1 items-start p-0 rounded-[var(--r-subtle)] overflow-hidden",
								"border transition-colors duration-[var(--motion-fast)]",
								"min-w-[100px] text-left",
								isActive
									? "border-[var(--accent-primary)] bg-[color-mix(in_oklab,var(--accent-primary)_8%,transparent)]"
									: "border-[var(--border-subtle)] bg-[var(--surface-container)] hover:border-[var(--border-default)]",
							].join(" ")}
							onClick={() => handleThemeChange(option.value)}
						>
							{/* W3 AC-50: color swatch preview — ~60px tall, rounded top, no border */}
							<div
								data-testid={`theme-swatch-preview-${option.value}`}
								aria-hidden="true"
								className="w-full rounded-t-[var(--r-subtle)]"
								style={{ height: "60px", ...swatchStyle(option.value) }}
							/>
							<div className="flex flex-col gap-[3px] px-[12px] py-[9px]">
								<span className="text-[13px] font-medium text-[var(--text-primary)]">
									{option.label}
								</span>
								<span className="text-[11px] text-[var(--text-tertiary)]">
									{option.description}
								</span>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
