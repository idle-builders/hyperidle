import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import daisyui from "daisyui";
import type { Config } from "tailwindcss";

const dir = dirname(fileURLToPath(import.meta.url));

export default {
	content: [
		resolve(dir, "index.html"),
		resolve(dir, "main.tsx"),
		resolve(dir, "../src/**/*.{ts,tsx}"),
	],
	theme: {
		extend: {
			fontFamily: {
				sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
				mono: ["ui-monospace", "SF Mono", "Cascadia Code", "monospace"],
			},
			colors: {
				"surface-page": "var(--surface-page)",
				"surface-container": "var(--surface-container)",
				"surface-elevated": "var(--surface-elevated)",
				"surface-overlay": "var(--surface-overlay)",
				"text-primary": "var(--text-primary)",
				"text-secondary": "var(--text-secondary)",
				"text-tertiary": "var(--text-tertiary)",
			},
			borderColor: {
				"border-subtle": "var(--border-subtle)",
				"border-default": "var(--border-default)",
				"border-strong": "var(--border-strong)",
			},
		},
	},
	plugins: [daisyui],
	daisyui: {
		themes: [
			{
				"hearth-light": {
					primary: "#16764f",
					"primary-content": "#ffffff",
					secondary: "#d97706",
					"secondary-content": "#ffffff",
					accent: "#6b5d4d",
					"accent-content": "#ffffff",
					neutral: "#ede7db",
					"neutral-content": "#2c241a",
					"base-100": "#f5f0e6",
					"base-200": "#ede7db",
					"base-300": "#e8e0d0",
					"base-content": "#2c241a",
					info: "#2e7dba",
					"info-content": "#ffffff",
					success: "#16764f",
					"success-content": "#ffffff",
					warning: "#d97706",
					"warning-content": "#ffffff",
					error: "#dc4a3a",
					"error-content": "#ffffff",
					"--rounded-box": "16px",
					"--rounded-btn": "9999px",
					"--rounded-badge": "9999px",
				},
			},
			{
				"hearth-dark": {
					primary: "#2eaa7a",
					"primary-content": "#ffffff",
					secondary: "#d97706",
					"secondary-content": "#ffffff",
					accent: "#a89880",
					"accent-content": "#1a1510",
					neutral: "#231e16",
					"neutral-content": "#ede5d8",
					"base-100": "#1a1510",
					"base-200": "#231e16",
					"base-300": "#3d342a",
					"base-content": "#ede5d8",
					info: "#4498d4",
					"info-content": "#ffffff",
					success: "#2eaa7a",
					"success-content": "#ffffff",
					warning: "#d97706",
					"warning-content": "#ffffff",
					error: "#ee6a5a",
					"error-content": "#ffffff",
					"--rounded-box": "16px",
					"--rounded-btn": "9999px",
					"--rounded-badge": "9999px",
				},
			},
		],
	},
} satisfies Config;
