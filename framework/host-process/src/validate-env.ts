// @lore: laptop/dev profile uses a well-known default key so `npm run dev`
// works without env setup. The key only protects localhost from localhost —
// not meaningful security. VPS/cloud require an explicit key since the API
// is network-exposed.
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
