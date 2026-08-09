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
			// Hearth light canvas: pale lemon cream
			return { background: "#fcf8e8" };
		case "dark":
			// Hearth dark canvas: deep warm near-black with a lemon whisper
			return { background: "#14140b" };
		case "system":
			// Diagonal split of light + dark to represent "follows OS"
			return { background: "linear-gradient(135deg, #fcf8e8 50%, #14140b 50%)" };
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
		<div className="flex flex-col gap-[18px] max-w-none">
			<span className="text-[13px] font-[500] text-[var(--text-primary)]">Theme</span>
			<div className="flex items-center gap-[12px] flex-wrap">
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
								"flex flex-col items-start p-0 rounded-[var(--r-default)] overflow-hidden",
								"border-[1.5px] transition-colors duration-[var(--motion-fast)]",
								"w-[120px] text-left cursor-pointer",
								isActive
									? "border-[var(--accent-deep)]"
									: "border-[var(--border-default)] hover:border-[var(--border-strong)]",
							].join(" ")}
							style={isActive ? { boxShadow: "0 0 0 3px var(--accent-primary-dim)" } : undefined}
							onClick={() => handleThemeChange(option.value)}
						>
							{/* W3 AC-50: color swatch preview — 48px tall, rounded top, no border */}
							<div
								data-testid={`theme-swatch-preview-${option.value}`}
								aria-hidden="true"
								className="w-full rounded-t-[var(--r-default)]"
								style={{ height: "48px", ...swatchStyle(option.value) }}
							/>
							<div className="px-[12px] py-[9px]">
								<span className="text-[13px] font-[500] text-[var(--text-primary)]">
									{option.label}
								</span>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
