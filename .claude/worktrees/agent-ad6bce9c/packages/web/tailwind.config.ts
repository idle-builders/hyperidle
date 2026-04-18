import daisyui from "daisyui";
import type { Config } from "tailwindcss";

export default {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Inter", "system-ui", "sans-serif"],
				heading: ["Space Grotesk", "system-ui", "sans-serif"],
			},
		},
	},
	plugins: [daisyui],
	daisyui: {
		themes: [
			{
				"factory-dark": {
					primary: "#adc6ff",
					secondary: "#d58f24",
					accent: "#bbffb3",
					neutral: "#191a1a",
					"base-100": "#000000",
					"base-200": "#0e0e0e",
					"base-300": "#131313",
					info: "#adc6ff",
					success: "#bbffb3",
					warning: "#d58f24",
					error: "#ee7d77",
					"--rounded-box": "4px",
					"--rounded-btn": "2px",
					"--rounded-badge": "2px",
				},
			},
		],
	},
} satisfies Config;
