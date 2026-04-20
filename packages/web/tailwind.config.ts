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
					"primary-content": "#000000",
					secondary: "#d58f24",
					"secondary-content": "#000000",
					accent: "#bbffb3",
					"accent-content": "#000000",
					neutral: "#191a1a",
					"neutral-content": "#d1d0cf",
					"base-100": "#000000",
					"base-200": "#0e0e0e",
					"base-300": "#131313",
					"base-content": "#d1d0cf",
					info: "#adc6ff",
					"info-content": "#000000",
					success: "#bbffb3",
					"success-content": "#000000",
					warning: "#d58f24",
					"warning-content": "#000000",
					error: "#ee7d77",
					"error-content": "#000000",
					"--rounded-box": "4px",
					"--rounded-btn": "2px",
					"--rounded-badge": "2px",
				},
			},
		],
	},
} satisfies Config;
