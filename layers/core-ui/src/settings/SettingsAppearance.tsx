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

// @lore: swatchStyle — CSS vars resolve to the active theme, not the previewed one; fixed warm-toned hex values required for inactive theme previews
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
			<span className="type-small   text-[var(--text-primary)]">Theme</span>
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
								"border-width-thin",
								"w-[120px] text-left cursor-pointer",
								isActive
									? "border-[var(--accent-deep)]"
									: "border-[var(--border-default)] hover:border-[var(--border-strong)]",
							].join(" ")}
							style={isActive ? { boxShadow: "0 0 0 3px var(--accent-primary-dim)" } : undefined}
							onClick={() => handleThemeChange(option.value)}
						>
							{/* color swatch preview — 48px tall, rounded top, no border */}
							<div
								data-testid={`theme-swatch-preview-${option.value}`}
								aria-hidden="true"
								className="w-full rounded-t-[var(--r-default)]"
								style={{ height: "48px", ...swatchStyle(option.value) }}
							/>
							<div className="px-[12px] py-[9px]">
								<span className="type-small   text-[var(--text-primary)]">{option.label}</span>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
