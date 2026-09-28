// @lore: validateStartupEnv — only laptop/dev may fall back to the default key; vps/cloud are network-exposed and must require an explicit key
export function validateStartupEnv(env: Record<string, string | undefined>): string | null {
	if (!env.HYPERIDLE_API_KEY) {
		const profile = env.HYPERIDLE_PROFILE ?? "laptop";
		if (profile === "vps" || profile === "cloud") {
			return "HYPERIDLE_API_KEY is required for VPS/cloud profiles. Set it in your environment.";
		}
		env.HYPERIDLE_API_KEY = "hyperidle-dev-local";
		process.env.HYPERIDLE_API_KEY = "hyperidle-dev-local";
	}
	return null;
}
