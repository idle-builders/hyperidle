// @lore: validateStartupEnv — only laptop/dev may fall back to the default key; vps/cloud are network-exposed and must require an explicit key
// @lore: validateStartupEnv — serving HTTPS means the server is reachable by others, so it needs its own team key, never the default
export function validateStartupEnv(env: Record<string, string | undefined>): string | null {
	if (env.HYPERIDLE_TLS_DOMAIN) {
		if (!env.CLOUDFLARE_API_TOKEN)
			return "HYPERIDLE_TLS_DOMAIN needs CLOUDFLARE_API_TOKEN to prove the name for its certificate.";
		if (!env.HYPERIDLE_API_KEY)
			return "HYPERIDLE_TLS_DOMAIN needs HYPERIDLE_API_KEY: a server others reach needs its own team key.";
	}
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
