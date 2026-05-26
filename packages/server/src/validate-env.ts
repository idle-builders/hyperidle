export function validateStartupEnv(env: Record<string, string | undefined>): string | null {
	if (!env.HYPERIDLE_API_KEY) {
		return "HYPERIDLE_API_KEY is required. Set it in your environment before starting the server.";
	}
	return null;
}
