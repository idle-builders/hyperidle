/**
 * T4 (BA5 §14.2) — LocalFolderAdapter, through the public `RegistryFilesystemMounter`.
 *
 * AC1: mount symlinks the folder into `<workspace>/<folderName>`; files accessible.
 * AC2: a second mount into the SAME workspace recognises the existing symlink
 * (`adopted: true`) instead of failing — the resume case (§5.4).
 * AC3: unmount is a no-op — the symlink goes with the workspace itself (§5.5).
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
		expect(result.mounted.trustedPath).toBe(fs.realpathSync(vaultDir));
		expect(result.mounted.adopted).toBe(false);
	});

	it("a second mount into the same workspace recognises the existing symlink instead of failing (resume)", async () => {
		const workspacePath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });
		const adapter = new RegistryFilesystemMounter(makeDeps());
		const input = {
			filesystem: makeFs(vaultDir),
			workspacePath,
			sessionId: "session-2",
			folderName: "my-vault",
			credential: null,
		};

		await adapter.mount(input);
		const second = await adapter.mount(input);

		expect(second.ok).toBe(true);
		if (!second.ok) throw new Error("unreachable");
		expect(second.mounted.adopted).toBe(true);
	});

	it("unmount is a no-op — the symlink goes with the workspace", async () => {
		const workspacePath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });
		const adapter = new RegistryFilesystemMounter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs(vaultDir),
			workspacePath,
			sessionId: "session-3",
			folderName: "my-vault",
			credential: null,
		});
		if (!result.ok) throw new Error("mount failed");

		await expect(adapter.unmount(result.mounted)).resolves.toBeUndefined();
		// nothing removed — the folder link is still there, unaffected by unmount.
		expect(fs.existsSync(path.join(workspacePath, "my-vault"))).toBe(true);
	});

	it("mount: returns ok:false when the folder does not exist", async () => {
		const workspacePath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs("/nonexistent/vault/path"),
			workspacePath,
			sessionId: "session-4",
			folderName: "path",
			credential: null,
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.reason).toContain("does not exist");
	});
});
