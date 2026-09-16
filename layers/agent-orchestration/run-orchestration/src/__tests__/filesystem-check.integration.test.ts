/**
 * T5 (BA5 §14.2/§7.2) — `checkFilesystem`, through the real `git` binary and
 * the real, offline `github-stand-in` (§14.1) for every git-level outcome.
 *
 * `ghAuthStatus` is one of `checkFilesystem`'s own injected `deps` (§2.5) —
 * this file uses the REAL one (`../../../src/cli-status.js`, proven for real
 * against the installed `gh` binary in `cli-status.integration.test.ts`,
 * T5b) for every case that is provable offline or against real GitHub with a
 * deterministically-invalid credential: gh absent, gh present but logged
 * out, and a syntactically-wrong PAT (real GitHub really does reject it —
 * this sandbox has live network — so nothing about that outcome is faked).
 *
 * The ONE exception is "a working PAT" (`ghAuthStatus` reporting
 * `logged_in`): `gh auth status` validates a `GH_TOKEN` against the real
 * GitHub API (verified in `cli-status.integration.test.ts`'s sibling probe —
 * an invalid token trips a genuine network round trip), so proving the
 * `logged_in` branch for real needs a currently-valid GitHub PAT — a live
 * secret this suite cannot hold. `checkFilesystem`'s own contract is a
 * dependency it is HANDED (`deps.ghAuthStatus`), so that ONE case injects a
 * fake resolving `"logged_in"` while every git-level step around it (`git
 * ls-remote` against the real stand-in, with the real PAT-shaped
 * `gitCredentialEnv`) stays real. The full live proof — a real PAT, a real
 * revoke — is G2's job on the running app (architecture §14.3), not this
 * suite's.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	type GithubStandIn,
	startGithubStandIn,
} from "../../../src/__testing__/github-stand-in.js";
import { pathWithGitOnly } from "../../../src/__testing__/path-only-git.js";
import { ghAuthStatus } from "../../../src/cli-status.js";
import { createGitRunner } from "../../../src/git-runner.js";
import { checkFilesystem } from "../filesystem-check.js";
import type { Filesystem } from "../mounter.js";
import type { RcloneRunner } from "../mounter-ports.js";

/**
 * None of these cases exercise the drive branch — a real `RcloneRunner`
 * belongs to V1/V2/V6, not here — but `FilesystemCheckDeps.rclone` is
 * required, so every call needs one. `listRemotes`/`statPath` are never
 * called by a `code`/`doc_set` check; this stub exists only to satisfy the
 * type.
 */
const rclone: RcloneRunner = {
	listRemotes: () => Promise.reject(new Error("not used by this suite")),
	statPath: () => Promise.reject(new Error("not used by this suite")),
	copyDown: () => Promise.reject(new Error("not used by this suite")),
};

const dirs: string[] = [];
function tracked(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function initLocalRepo(dir: string): void {
	execFileSync("git", ["init", "--quiet", "-b", "main", dir]);
	execFileSync("git", ["-C", dir, "config", "user.email", "t5@hyperidle.test"]);
	execFileSync("git", ["-C", dir, "config", "user.name", "t5"]);
	fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
	execFileSync("git", ["-C", dir, "add", "-A"]);
	execFileSync("git", ["-C", dir, "commit", "--quiet", "-m", "seed"]);
}

function makeFilesystem(
	overrides: Partial<Filesystem> & { resourceRef: Filesystem["resourceRef"] },
): Filesystem {
	return {
		id: "fs-t5",
		teamId: "team-1",
		source: "local",
		kind: "code",
		connectionId: null,
		state: "attached",
		createdAt: "2026-09-11T00:00:00.000Z",
		...overrides,
	};
}

const gitRunnerFactory = (cwd: string) => createGitRunner(cwd);

describe("checkFilesystem — folder (doc_set)", () => {
	it("ok when the folder exists", async () => {
		const folder = tracked("t5-folder-ok-");
		const result = await checkFilesystem(
			makeFilesystem({ kind: "doc_set", resourceRef: { kind: "doc_set", folder } }),
			{ credential: null, gitRunnerFactory, ghAuthStatus, rclone },
		);
		expect(result).toEqual({ ok: true, reason: null });
	});

	it("not ok, with a reason, when the folder is gone", async () => {
		const result = await checkFilesystem(
			makeFilesystem({
				kind: "doc_set",
				resourceRef: { kind: "doc_set", folder: "/no/such/folder-t5" },
			}),
			{ credential: null, gitRunnerFactory, ghAuthStatus, rclone },
		);
		expect(result.ok).toBe(false);
		expect(result.reason?.length ?? 0).toBeGreaterThan(0);
	});
});

describe("checkFilesystem — local git repo", () => {
	it("ok when the configured branch resolves", async () => {
		const repoDir = tracked("t5-local-ok-");
		initLocalRepo(repoDir);
		const result = await checkFilesystem(
			makeFilesystem({ resourceRef: { kind: "code", repo: repoDir, branch: "main" } }),
			{ credential: null, gitRunnerFactory, ghAuthStatus, rclone },
		);
		expect(result).toEqual({ ok: true, reason: null });
	});

	it("not ok when the configured branch does not exist", async () => {
		const repoDir = tracked("t5-local-missing-branch-");
		initLocalRepo(repoDir);
		const result = await checkFilesystem(
			makeFilesystem({ resourceRef: { kind: "code", repo: repoDir, branch: "does-not-exist" } }),
			{ credential: null, gitRunnerFactory, ghAuthStatus, rclone },
		);
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("does-not-exist");
	});
});

describe("checkFilesystem — git remote, through the real offline github-stand-in", () => {
	let standIn: GithubStandIn;

	beforeAll(async () => {
		standIn = await startGithubStandIn();
	});
	afterAll(async () => {
		await standIn.close();
	});

	it("a public remote is ok with gh entirely absent from PATH — gh is never consulted", async () => {
		const { url } = standIn.createRepo("t5-public", { branch: "main" });
		vi.stubEnv("PATH", pathWithGitOnly(tracked));
		vi.stubEnv("HOME", standIn.home());

		const result = await checkFilesystem(
			makeFilesystem({
				source: "github",
				resourceRef: { kind: "code", repo: url, branch: "main" },
			}),
			{ credential: null, gitRunnerFactory, ghAuthStatus, rclone },
		);
		expect(result).toEqual({ ok: true, reason: null });
	});

	it("a private remote with no connection and gh absent → names installing gh", async () => {
		standIn.createRepo("t5-private-nogh", { private: true, token: "irrelevant", branch: "main" });
		vi.stubEnv("PATH", pathWithGitOnly(tracked));
		vi.stubEnv("HOME", standIn.home());

		const result = await checkFilesystem(
			makeFilesystem({
				source: "github",
				resourceRef: {
					kind: "code",
					repo: "https://github.com/t5-private-nogh.git",
					branch: "main",
				},
			}),
			{ credential: null, gitRunnerFactory, ghAuthStatus, rclone },
		);
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("Install the GitHub CLI (gh)");
	});

	it("a private remote with gh installed but logged out → names `gh auth login`", async () => {
		standIn.createRepo("t5-private-loggedout", {
			private: true,
			token: "irrelevant-2",
			branch: "main",
		});
		vi.stubEnv("HOME", standIn.home());

		const result = await checkFilesystem(
			makeFilesystem({
				source: "github",
				resourceRef: {
					kind: "code",
					repo: "https://github.com/t5-private-loggedout.git",
					branch: "main",
				},
			}),
			{ credential: null, gitRunnerFactory, ghAuthStatus, rclone },
		);
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("gh auth login");
	});

	it("a wrong PAT on a token connection → not ok, names the rejected token", async () => {
		standIn.createRepo("t5-wrong-pat", { private: true, token: "the-real-token", branch: "main" });
		vi.stubEnv("HOME", standIn.home());

		const result = await checkFilesystem(
			makeFilesystem({
				source: "github",
				connectionId: "conn-t5-wrong",
				resourceRef: {
					kind: "code",
					repo: "https://github.com/t5-wrong-pat.git",
					branch: "main",
				},
			}),
			{
				credential: "definitely-not-a-real-github-token-t5",
				gitRunnerFactory,
				// Stubbed, like the neighbouring "PAT ok" and "gh logged in" cases: a real
				// ghAuthStatus here spawns `gh auth status` with this token as GH_TOKEN,
				// which gh validates against the live GitHub API and makes this service-lane
				// test depend on the internet. `checkFilesystem` is only ever HANDED
				// ghAuthStatus as a dependency (deps.ghAuthStatus), and production maps
				// `logged_out` plus a set connectionId to REASON_TOKEN_REJECTED regardless
				// of *why* gh reports logged_out -- so stubbing the outcome leaves the
				// behaviour under test unchanged. The real rejection with a real token is
				// G2's live proof on the running app.
				ghAuthStatus: async () => "logged_out",
				rclone,
			},
		);
		expect(result.ok).toBe(false);
		expect(result.reason).toBe(
			"The GitHub token was rejected. Replace it in Settings → Connections",
		);
	});

	it("connection set but its token did not resolve → not ok, names the missing connection (no gh/git call)", async () => {
		const ghAuthStatusSpy = vi.fn();
		const gitRunnerFactorySpy = vi.fn();

		const result = await checkFilesystem(
			makeFilesystem({
				source: "github",
				connectionId: "conn-t5-unresolved",
				resourceRef: {
					kind: "code",
					repo: "https://github.com/t5-unresolved.git",
					branch: "main",
				},
			}),
			{
				credential: null,
				gitRunnerFactory: gitRunnerFactorySpy,
				ghAuthStatus: ghAuthStatusSpy,
				rclone,
			},
		);

		expect(result.ok).toBe(false);
		expect(result.reason).toBe(
			"the GitHub token connection for this filesystem is missing or cannot be decrypted",
		);
		expect(ghAuthStatusSpy).not.toHaveBeenCalled();
		expect(gitRunnerFactorySpy).not.toHaveBeenCalled();
	});

	it("a working PAT (stubbed logged_in) reaches the real private stand-in repo", async () => {
		standIn.createRepo("t5-pat-ok", { private: true, token: "good-pat-t5", branch: "main" });
		vi.stubEnv("HOME", standIn.home());

		const result = await checkFilesystem(
			makeFilesystem({
				source: "github",
				connectionId: "conn-t5-ok",
				resourceRef: { kind: "code", repo: "https://github.com/t5-pat-ok.git", branch: "main" },
			}),
			{
				credential: "good-pat-t5",
				gitRunnerFactory,
				ghAuthStatus: async () => "logged_in",
				rclone,
			},
		);
		expect(result).toEqual({ ok: true, reason: null });
	});

	it("a missing branch on a public remote → names the branch", async () => {
		standIn.createRepo("t5-branch-missing", { branch: "main" });
		vi.stubEnv("HOME", standIn.home());

		const result = await checkFilesystem(
			makeFilesystem({
				source: "github",
				resourceRef: {
					kind: "code",
					repo: "https://github.com/t5-branch-missing.git",
					branch: "does-not-exist",
				},
			}),
			{ credential: null, gitRunnerFactory, ghAuthStatus, rclone },
		);
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("does-not-exist");
	});
});
