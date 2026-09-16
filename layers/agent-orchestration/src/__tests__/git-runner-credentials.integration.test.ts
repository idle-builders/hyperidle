/**
 * T2 (BA5 §14.2) — the runner reaches a github.com remote through the
 * person's own git setup and through `gh`, against the real, offline
 * `github-stand-in` (§14.1). No stub of git, `gh`, or the credential path:
 * only the DNS-equivalent (a proxy answering CONNECT for `github.com`) is
 * fake, and only because there is no other way to reach `github.com` from a
 * CI runner without a live network + live GitHub credentials.
 */
import * as os from "node:os";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { type GithubStandIn, startGithubStandIn } from "../__testing__/github-stand-in.js";
import { createGitRunner } from "../git-runner.js";

let standIn: GithubStandIn;

beforeAll(async () => {
	standIn = await startGithubStandIn();
});

afterAll(async () => {
	await standIn.close();
});

function useHome(opts?: { ghLogin?: { token: string } }): void {
	vi.stubEnv("HOME", standIn.home(opts));
}

/** `gitCredentialEnv`'s helper attachment, re-derived inline: `run-orchestration`
 * is a sibling Service this layer-root file may not depend on (Mechanism C). */
function gitCredentialHelperEnv(): Record<string, string> {
	return {
		GIT_CONFIG_COUNT: "2",
		GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
		GIT_CONFIG_VALUE_0: "",
		GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
		GIT_CONFIG_VALUE_1: "!gh auth git-credential",
	};
}

describe("git runner reaches github.com through the person's setup + gh (T2)", () => {
	test("a PAT via GH_TOKEN authenticates a private repo", async () => {
		standIn.createRepo("private-pat", { private: true, token: "good-token", branch: "main" });
		useHome();
		const runner = createGitRunner(os.tmpdir());
		const result = await runner.lsRemote("https://github.com/private-pat.git", {
			env: { ...gitCredentialHelperEnv(), GH_TOKEN: "good-token" },
			branch: "main",
		});
		expect(result).toMatchObject({ reachable: true, found: true });
	});

	test("the person's own gh login (hosts.yml, no GH_TOKEN) authenticates a private repo", async () => {
		standIn.createRepo("private-ghlogin", {
			private: true,
			token: "login-token",
			branch: "main",
		});
		useHome({ ghLogin: { token: "login-token" } });
		const runner = createGitRunner(os.tmpdir());
		const result = await runner.lsRemote("https://github.com/private-ghlogin.git", {
			env: gitCredentialHelperEnv(),
			branch: "main",
		});
		expect(result).toMatchObject({ reachable: true, found: true });
	});

	test("a wrong PAT fails with authRequested and never leaks the token in the reason", async () => {
		standIn.createRepo("private-wrong", { private: true, token: "good-token", branch: "main" });
		useHome();
		const runner = createGitRunner(os.tmpdir());
		const result = await runner.lsRemote("https://github.com/private-wrong.git", {
			env: { ...gitCredentialHelperEnv(), GH_TOKEN: "wrong-token" },
			branch: "main",
		});
		expect(result.reachable).toBe(false);
		expect(result.authRequested).toBe(true);
		expect(result.reason ?? "").not.toContain("wrong-token");
	});

	test("no login at all fails with authRequested", async () => {
		standIn.createRepo("private-nologin", { private: true, token: "good-token", branch: "main" });
		useHome();
		const runner = createGitRunner(os.tmpdir());
		const result = await runner.lsRemote("https://github.com/private-nologin.git", {
			env: gitCredentialHelperEnv(),
			branch: "main",
		});
		expect(result.reachable).toBe(false);
		expect(result.authRequested).toBe(true);
	});

	test("a public repo needs no gh at all — the helper sits there unused", async () => {
		standIn.createRepo("public-repo", { branch: "main" });
		useHome();
		const runner = createGitRunner(os.tmpdir());
		const result = await runner.lsRemote("https://github.com/public-repo.git", {
			branch: "main",
		});
		expect(result).toMatchObject({ reachable: true, found: true });
	});

	test("a missing branch reports exit code 2 as branchMissing, not a failure", async () => {
		standIn.createRepo("public-branch-check", { branch: "main" });
		useHome();
		const runner = createGitRunner(os.tmpdir());
		const result = await runner.lsRemote("https://github.com/public-branch-check.git", {
			branch: "does-not-exist",
		});
		expect(result).toMatchObject({ reachable: true, found: false, branchMissing: true });
	});
});
