import daisyui from "daisyui";
import type { Config } from "tailwindcss";

export default {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {},
	},
	plugins: [daisyui],
	daisyui: {
		themes: [
			{
				"factory-dark": {
					primary: "#6366f1",
					secondary: "#818cf8",
					accent: "#f59e0b",
					neutral: "#1e1e2e",
					"base-100": "#0f0f1a",
					"base-200": "#1a1a2e",
					"base-300": "#252540",
					info: "#38bdf8",
					success: "#22c55e",
					warning: "#f59e0b",
					error: "#ef4444",
				},
			},
		],
	},
} satisfies Config;
