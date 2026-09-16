/**
 * @lore: the env HyperIdle's own git needs to authenticate a
 * `https://github.com/` remote through `gh`'s own credential helper. Never a
 * token in argv or a URL: the helper attachment plus `GH_TOKEN` are the only
 * shapes a secret ever takes on the way to a child process (`git-runner.ts`).
 *
 * Empty for anything else — a local repo, another host, or an ssh URL — so
 * GitLab, the person's ssh agent and `osxkeychain` are left entirely alone
 * (`git-runner.ts` §6.3 stopped nulling the person's own git config for
 * exactly this reason).
 */

const GITHUB_HTTPS_REMOTE = /^https:\/\/github\.com\//i;

export function gitCredentialEnv(remoteUrl: string, token: string | null): Record<string, string> {
	if (!GITHUB_HTTPS_REMOTE.test(remoteUrl)) return {};
	const env: Record<string, string> = {
		GIT_CONFIG_COUNT: "2",
		// Index 0 resets any inherited helper list for this URL scope before
		// index 1 attaches gh's own — otherwise a helper from the person's own
		// config could answer first with the wrong identity.
		GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
		GIT_CONFIG_VALUE_0: "",
		GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
		GIT_CONFIG_VALUE_1: "!gh auth git-credential",
	};
	if (token) env.GH_TOKEN = token;
	return env;
}

/**
 * Merge several `gitCredentialEnv` outputs into one indexed
 * `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` list, deduplicated by (key, value).
 *
 * @lore BA5 §6.1: when several github.com filesystems are mounted, a naive
 * `{...a, ...b}` spread is wrong — both inputs reuse the same `GIT_CONFIG_
 * KEY_0`/`VALUE_0` names, so the later filesystem's pair silently overwrites
 * the earlier one's instead of adding to it, and `GIT_CONFIG_COUNT` never
 * grows past whichever input was spread last. This renumbers every surviving
 * pair across all inputs instead. `GH_TOKEN` is not indexed — last non-empty
 * value wins, matching the single env slot a spawned process actually reads.
 */
export function mergeGitConfigEnv(
	envs: readonly Readonly<Record<string, string>>[],
): Record<string, string> {
	const pairs: Array<{ key: string; value: string }> = [];
	const seen = new Set<string>();
	let ghToken: string | undefined;
	for (const env of envs) {
		const count = Number.parseInt(env.GIT_CONFIG_COUNT ?? "0", 10) || 0;
		for (let i = 0; i < count; i++) {
			const key = env[`GIT_CONFIG_KEY_${i}`];
			const value = env[`GIT_CONFIG_VALUE_${i}`];
			if (key === undefined || value === undefined) continue;
			const dedupeKey = `${key}${value}`;
			if (seen.has(dedupeKey)) continue;
			seen.add(dedupeKey);
			pairs.push({ key, value });
		}
		if (env.GH_TOKEN) ghToken = env.GH_TOKEN;
	}
	const merged: Record<string, string> = {};
	if (pairs.length > 0) {
		merged.GIT_CONFIG_COUNT = String(pairs.length);
		pairs.forEach((pair, i) => {
			merged[`GIT_CONFIG_KEY_${i}`] = pair.key;
			merged[`GIT_CONFIG_VALUE_${i}`] = pair.value;
		});
	}
	if (ghToken) merged.GH_TOKEN = ghToken;
	return merged;
}
