/**
 * Startup environment validation for the remote-server application.
 *
 * Moved here from the deleted `@hyperidle/host-process` package.
 *
 * @lore laptop/dev profile sets a default key so `npm run dev` works without
 * env setup. VPS/cloud are network-exposed and require an explicit key.
 */
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
