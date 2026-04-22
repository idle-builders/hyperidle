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
					secondary: "#78787e",
					"secondary-content": "#ffffff",
					accent: "#8e8e94",
					"accent-content": "#ffffff",
					neutral: "#eaeae8",
					"neutral-content": "#1a1a1e",
					"base-100": "#fafaf9",
					"base-200": "#f4f4f2",
					"base-300": "#eaeae8",
					"base-content": "#1a1a1e",
					info: "#4f46e5",
					"info-content": "#ffffff",
					success: "#8e8e94",
					"success-content": "#ffffff",
					warning: "#78787e",
					"warning-content": "#ffffff",
					error: "#dc2626",
					"error-content": "#ffffff",
					"--rounded-box": "8px",
					"--rounded-btn": "4px",
					"--rounded-badge": "4px",
				},
			},
		],
	},
} satisfies Config;
