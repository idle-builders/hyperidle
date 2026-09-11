/**
 * T1 (BA5 §14.2, §6.1) — `gitCredentialEnv` and `mergeGitConfigEnv`, pure
 * unit coverage. Redaction itself is covered by
 * `layers/agent-orchestration/src/__tests__/redact-secrets.test.ts` (L2).
 */
import { describe, expect, it } from "vitest";
import { gitCredentialEnv, mergeGitConfigEnv } from "../git-credential-env.js";

describe("gitCredentialEnv", () => {
	it("attaches the gh credential helper for an https://github.com/ remote, with GH_TOKEN when a token is given", () => {
		const env = gitCredentialEnv("https://github.com/owner/repo.git", "ghp_secret");
		expect(env).toMatchObject({
			GIT_CONFIG_COUNT: "2",
			GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
			GIT_CONFIG_VALUE_0: "",
			GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
			GIT_CONFIG_VALUE_1: "!gh auth git-credential",
			GH_TOKEN: "ghp_secret",
		});
	});

	it("omits GH_TOKEN when no token is given — the person's own gh login answers instead", () => {
		const env = gitCredentialEnv("https://github.com/owner/repo.git", null);
		expect(env.GH_TOKEN).toBeUndefined();
		expect(env.GIT_CONFIG_COUNT).toBe("2");
	});

	it("is empty for a non-github https host — GitLab relies on the person's own git setup", () => {
		expect(gitCredentialEnv("https://gitlab.com/owner/repo.git", "token")).toEqual({});
	});

	it("is empty for an ssh remote", () => {
		expect(gitCredentialEnv("git@github.com:owner/repo.git", "token")).toEqual({});
	});

	it("is empty for a local repo path", () => {
		expect(gitCredentialEnv("/Users/me/repo", "token")).toEqual({});
	});
});

describe("mergeGitConfigEnv", () => {
	it("merges a single filesystem's env unchanged", () => {
		const one = gitCredentialEnv("https://github.com/a/repo.git", "tok-a");
		expect(mergeGitConfigEnv([one])).toEqual(one);
	});

	it("renumbers indices contiguously across inputs with genuinely distinct pairs", () => {
		// `gitCredentialEnv` itself only ever emits one fixed, host-scoped pair
		// set for github.com — this proves the renumbering logic in isolation,
		// against two indexed envs a future second host-scoped helper could
		// plausibly produce, without relying on that helper existing yet.
		const a = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "k-a", GIT_CONFIG_VALUE_0: "v-a" };
		const b = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "k-b", GIT_CONFIG_VALUE_0: "v-b" };
		const merged = mergeGitConfigEnv([a, b]);
		// Naive `{...a, ...b}` would leave GIT_CONFIG_COUNT at "1" and silently
		// drop `a`'s entry under `b`'s identically-named KEY_0/VALUE_0 — every
		// pair from both inputs must survive under its own index.
		expect(merged.GIT_CONFIG_COUNT).toBe("2");
		expect([merged.GIT_CONFIG_KEY_0, merged.GIT_CONFIG_VALUE_0]).toEqual(["k-a", "v-a"]);
		expect([merged.GIT_CONFIG_KEY_1, merged.GIT_CONFIG_VALUE_1]).toEqual(["k-b", "v-b"]);
	});

	it("collapses two github.com filesystems to the one deduplicated pair — the helper key is host-scoped, not per-repo", () => {
		const a = gitCredentialEnv("https://github.com/a/repo.git", "tok-a");
		const b = gitCredentialEnv("https://github.com/b/repo.git", "tok-b");
		const merged = mergeGitConfigEnv([a, b]);
		expect(merged.GIT_CONFIG_COUNT).toBe("2");
	});

	it("deduplicates identical key/value pairs from two filesystems on the same host", () => {
		const a = gitCredentialEnv("https://github.com/a/repo.git", null);
		const b = gitCredentialEnv("https://github.com/b/repo.git", null);
		const merged = mergeGitConfigEnv([a, b]);
		// Both entries are the identical (key, value) helper-reset/attach pair —
		// one github.com host, so one indexed pair, not four.
		expect(merged.GIT_CONFIG_COUNT).toBe("2");
	});

	it("keeps the last non-empty GH_TOKEN when merging", () => {
		const a = gitCredentialEnv("https://github.com/a/repo.git", "tok-a");
		const b = gitCredentialEnv("https://github.com/b/repo.git", "tok-b");
		expect(mergeGitConfigEnv([a, b]).GH_TOKEN).toBe("tok-b");
	});

	it("returns an empty object for no filesystems", () => {
		expect(mergeGitConfigEnv([])).toEqual({});
	});
});
