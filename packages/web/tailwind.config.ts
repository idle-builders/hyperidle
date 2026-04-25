import daisyui from "daisyui";
import type { Config } from "tailwindcss";

export default {
	content: ["./index.html", "./src/**/*.{ts,tsx}", "../design-system/src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Geist", "Inter", "system-ui", "sans-serif"],
				heading: ["Geist Mono", "ui-monospace", "monospace"],
			},
			colors: {
				"surface-0": "var(--surface-0)",
				"surface-1": "var(--surface-1)",
				"surface-2": "var(--surface-2)",
				"surface-3": "var(--surface-3)",
				"surface-4": "var(--surface-4)",
				"surface-5": "var(--surface-5)",
				"surface-6": "var(--surface-6)",
				"surface-ghost": "var(--surface-ghost)",
				"text-hi": "var(--text-hi)",
				"text-mid": "var(--text-mid)",
				"text-lo": "var(--text-lo)",
			},
			borderColor: {
				"border-subtle": "var(--border-subtle)",
				"border-default": "var(--border-default)",
				"border-emphasis": "var(--border-emphasis)",
			},
		},
	},
	plugins: [daisyui],
	daisyui: {
		themes: [
			{
				"lucid-dark": {
					primary: "#e0e7ff",
					"primary-content": "#111113",
					secondary: "#a8a8b0",
					"secondary-content": "#111113",
					accent: "#c8c8d0",
					"accent-content": "#111113",
					neutral: "#27272b",
					"neutral-content": "#ededef",
					"base-100": "#111113",
					"base-200": "#19191c",
					"base-300": "#1e1e22",
					"base-content": "#ededef",
					info: "#e0e7ff",
					"info-content": "#111113",
					success: "#c8c8d0",
					"success-content": "#111113",
					warning: "#a8a8b0",
					"warning-content": "#111113",
					error: "#f87171",
					"error-content": "#111113",
					"--rounded-box": "8px",
					"--rounded-btn": "4px",
					"--rounded-badge": "4px",
				},
			},
			{
				"lucid-light": {
					primary: "#4f46e5",
					"primary-content": "#ffffff",
					// @lore K8 — `secondary`/`warning` darkened to mirror the
					// `--warn` token bump (`packages/design-system/src/tokens.css`).
					// K7's #78787e failed WCAG 2.1 AA on white at 12px;
					// #444448 clears 4.5:1 on the entire light-surface ladder.
					secondary: "#444448",
					"secondary-content": "#ffffff",
					// @lore K8 — `accent`/`success` darkened to mirror the
					// `--ok` token bump. K7's #8e8e94 failed WCAG 2.1 AA;
					// #4d4d52 clears 4.5:1 on the entire light-surface ladder.
					accent: "#4d4d52",
					"accent-content": "#ffffff",
					neutral: "#eaeae8",
					"neutral-content": "#1a1a1e",
					"base-100": "#fafaf9",
					"base-200": "#f4f4f2",
					"base-300": "#eaeae8",
					"base-content": "#1a1a1e",
					info: "#4f46e5",
					"info-content": "#ffffff",
					success: "#4d4d52",
					"success-content": "#ffffff",
					warning: "#444448",
					"warning-content": "#ffffff",
					// @lore K8 — `error` darkened to mirror `--danger` so the
					// `text-error` class used in shell badges (Rail
					// CollapsedPill, Toast, etc.) clears the 4.5:1 floor on
					// the danger tint background.
					error: "#a91515",
					"error-content": "#ffffff",
					"--rounded-box": "8px",
					"--rounded-btn": "4px",
					"--rounded-badge": "4px",
				},
			},
		],
	},
} satisfies Config;
