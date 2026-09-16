/**
 * T4 (BA5 §14.2) — LocalFolderAdapter, through the public `RegistryFilesystemMounter`.
 *
 * AC1: mount symlinks the folder into `<workspace>/<folderName>`; files accessible.
 * AC2: a second mount into the SAME workspace recognises the existing symlink
 * (`reused: true`) instead of failing — the resume case (§5.4).
 *
 * @lore BA5 (no-teardown): there is no `unmount` any more — a folder mount
 * never had anything to remove (the symlink goes with the workspace itself),
 * so there is nothing left to test for it.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegistryFilesystemMounter } from "../index.js";
import type { AdapterDeps, Filesystem } from "../mounter.js";

function makeFs(folderPath: string): Filesystem {
	return {
		id: "fs-folder-test",
		teamId: "team-1",
		source: "local",
		kind: "doc_set",
		connectionId: null,
		resourceRef: { kind: "doc_set", folder: folderPath },
		state: "reachable",
		createdAt: "2025-01-01T00:00:00Z",
	};
}

describe("LocalFolderAdapter integration (thin)", () => {
	let tmpDir: string;
	let vaultDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-folder-adapter-"));
		vaultDir = path.join(tmpDir, "my-vault");
		fs.mkdirSync(vaultDir, { recursive: true });
		fs.writeFileSync(path.join(vaultDir, "index.md"), "# Index\n");
		fs.writeFileSync(path.join(vaultDir, "notes.md"), "# Notes\n");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeDeps(): AdapterDeps {
		return {
			gitRunnerFactory: (_repoPath: string) => {
				throw new Error("LocalFolderAdapter should not call gitRunnerFactory");
			},
		};
	}

	it("mount: symlinks the vault into workspacePath/folderName", async () => {
		const workspacePath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs(vaultDir),
			workspacePath,
			sessionId: "session-1",
			taskId: null,
			folderName: "my-vault",
			credential: null,
		});

		expect(result.ok).toBe(true);
		const linkPath = path.join(workspacePath, "my-vault");
		expect(fs.existsSync(linkPath)).toBe(true);
		expect(fs.existsSync(path.join(linkPath, "index.md"))).toBe(true);
		expect(fs.existsSync(path.join(linkPath, "notes.md"))).toBe(true);
		const stat = fs.lstatSync(linkPath);
		expect(stat.isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(linkPath)).toBe(fs.realpathSync(vaultDir));
		if (!result.ok) throw new Error("unreachable");
		expect(result.mounted.trustedPaths).toEqual([fs.realpathSync(vaultDir)]);
		expect(result.mounted.reused).toBe(false);
	});

	it("a second mount into the same workspace recognises the existing symlink instead of failing (resume)", async () => {
		const workspacePath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });
		const adapter = new RegistryFilesystemMounter(makeDeps());
		const input = {
			filesystem: makeFs(vaultDir),
			workspacePath,
			sessionId: "session-2",
			taskId: null,
			folderName: "my-vault",
			credential: null,
		};

		await adapter.mount(input);
		const second = await adapter.mount(input);

		expect(second.ok).toBe(true);
		if (!second.ok) throw new Error("unreachable");
		expect(second.mounted.reused).toBe(true);
	});

	it("mount: returns ok:false when the folder does not exist", async () => {
		const workspacePath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs("/nonexistent/vault/path"),
			workspacePath,
			sessionId: "session-4",
			taskId: null,
			folderName: "path",
			credential: null,
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.reason).toContain("does not exist");
	});
});
