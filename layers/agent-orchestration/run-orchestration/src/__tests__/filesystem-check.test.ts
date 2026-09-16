/**
 * V2 (Google Drive phase, §9.2) — `checkFilesystem`'s drive branch, every
 * reason, against a fake `RcloneRunner`. The port is a declared seam
 * `checkFilesystem` already uses the same way for `ghAuthStatus`
 * (`filesystem-check.integration.test.ts`) — legitimate to fake here, unlike
 * the git-level cases which run against the real binary in that file.
 */
import { describe, expect, it } from "vitest";
import { checkFilesystem } from "../filesystem-check.js";
import type { Filesystem } from "../mounter.js";
import type { RcloneOutcome, RcloneRunner } from "../mounter-ports.js";

function driveFilesystem(remote: string, path: string): Filesystem {
	return {
		id: "fs-drive-v2",
		teamId: "team-1",
		source: "gdrive",
		kind: "doc_set",
		connectionId: null,
		resourceRef: { kind: "drive", remote, path },
		state: "attached",
		createdAt: "2026-09-16T00:00:00.000Z",
	};
}

function fakeRclone(overrides: Partial<RcloneRunner>): RcloneRunner {
	return {
		listRemotes: () => Promise.resolve({ ok: true, value: ["gdrive"] }),
		statPath: () => Promise.resolve({ ok: true, value: { isDir: true } }),
		copyDown: () => Promise.resolve({ ok: true, value: undefined }),
		...overrides,
	};
}

const gitRunnerFactory = (): never => {
	throw new Error("not used by the drive branch");
};
const ghAuthStatus = (): Promise<never> => {
	throw new Error("not used by the drive branch");
};

describe("checkFilesystem — Google Drive", () => {
	it("rclone not installed → names installing rclone", async () => {
		const rclone = fakeRclone({
			listRemotes: () =>
				Promise.resolve({ ok: false, code: "not_installed", reason: "rclone is not installed" }),
		});
		const result = await checkFilesystem(driveFilesystem("gdrive", "Projects/Acme"), {
			credential: null,
			gitRunnerFactory,
			ghAuthStatus,
			rclone,
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("Install rclone");
	});

	it("remote absent from the configured list → names the missing remote and `rclone config`", async () => {
		const rclone = fakeRclone({
			listRemotes: () => Promise.resolve({ ok: true, value: ["some-other-remote"] }),
		});
		const result = await checkFilesystem(driveFilesystem("gdrive", "Projects/Acme"), {
			credential: null,
			gitRunnerFactory,
			ghAuthStatus,
			rclone,
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("No rclone remote named `gdrive`");
		expect(result.reason).toContain("rclone config");
	});

	it("directory not found (exit 3) → names the missing folder", async () => {
		const rclone = fakeRclone({
			statPath: () =>
				Promise.resolve({ ok: false, code: "directory_not_found", reason: "directory not found" }),
		});
		const result = await checkFilesystem(driveFilesystem("gdrive", "Projects/Acme"), {
			credential: null,
			gitRunnerFactory,
			ghAuthStatus,
			rclone,
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("Folder `Projects/Acme` is not in the `gdrive` Drive remote");
	});

	it("the item is a file, not a folder → says so", async () => {
		const rclone = fakeRclone({
			statPath: () => Promise.resolve({ ok: true, value: { isDir: false } }),
		});
		const result = await checkFilesystem(driveFilesystem("gdrive", "Projects/notes.txt"), {
			credential: null,
			gitRunnerFactory,
			ghAuthStatus,
			rclone,
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("`gdrive:Projects/notes.txt` is a file, not a folder");
	});

	it("any other rclone failure → names the fix (rclone config reconnect), not the raw error", async () => {
		const rclone = fakeRclone({
			statPath: () =>
				Promise.resolve({ ok: false, code: "failed", reason: "some opaque rclone stderr" }),
		});
		const result = await checkFilesystem(driveFilesystem("gdrive", "Projects/Acme"), {
			credential: null,
			gitRunnerFactory,
			ghAuthStatus,
			rclone,
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("rclone config reconnect gdrive:");
		expect(result.reason).toContain("some opaque rclone stderr");
	});

	it("remote configured, folder exists and is a directory → ok", async () => {
		const rclone = fakeRclone({});
		const result = await checkFilesystem(driveFilesystem("gdrive", "Projects/Acme"), {
			credential: null,
			gitRunnerFactory,
			ghAuthStatus,
			rclone,
		});
		expect(result).toEqual({ ok: true, reason: null });
	});

	it("checks the remote is configured BEFORE asking about the path — statPath never runs for an unconfigured remote", async () => {
		let statPathCalled = false;
		const rclone = fakeRclone({
			listRemotes: () => Promise.resolve({ ok: true, value: [] }),
			statPath: (): Promise<RcloneOutcome<{ isDir: boolean }>> => {
				statPathCalled = true;
				return Promise.resolve({ ok: true, value: { isDir: true } });
			},
		});
		const result = await checkFilesystem(driveFilesystem("gdrive", "Projects/Acme"), {
			credential: null,
			gitRunnerFactory,
			ghAuthStatus,
			rclone,
		});
		expect(result.ok).toBe(false);
		expect(statPathCalled).toBe(false);
	});
});
