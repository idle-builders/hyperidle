/**
 * AO2 — LocalFolderAdapter integration test (thin).
 *
 * AC1: mount symlinks the folder into sandboxPath; files accessible.
 * AC2: captureBack snapshots the changed subtree; snapshot dir exists with edit.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Filesystem } from "@hyperidle/filesystem-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AdapterDeps, RegistryFilesystemMounter } from "../index.js";

function makeFs(folderPath: string): Filesystem {
	return {
		id: "fs-folder-test",
		teamId: "team-1",
		source: "local",
		kind: "doc_set",
		connectionId: null,
		resourceRef: { kind: "doc_set", folder: folderPath },
		writeback: "file",
		state: "reachable",
		createdAt: "2025-01-01T00:00:00Z",
	};
}

describe("LocalFolderAdapter integration (thin)", () => {
	let tmpDir: string;
	let capturesDir: string;
	let vaultDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-folder-adapter-"));
		capturesDir = path.join(tmpDir, "captures");
		fs.mkdirSync(capturesDir, { recursive: true });
		// Create a test vault with some markdown files.
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
			capturesDir,
			db: { insert: () => ({ values: async () => undefined }) } as never,
		};
	}

	it("mount: symlinks the vault into sandboxPath/<basename>", async () => {
		const sandboxPath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs(vaultDir),
			sandboxPath,
			auth: null,
		});

		expect(result.success).toBe(true);
		const linkPath = path.join(sandboxPath, "my-vault");
		expect(fs.existsSync(linkPath)).toBe(true);
		// Files accessible through the symlink.
		expect(fs.existsSync(path.join(linkPath, "index.md"))).toBe(true);
		expect(fs.existsSync(path.join(linkPath, "notes.md"))).toBe(true);
		// It should be a symlink pointing to the real vault.
		const stat = fs.lstatSync(linkPath);
		expect(stat.isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(linkPath)).toBe(fs.realpathSync(vaultDir));
	});

	it("captureBack: snapshots the folder and returns capturePath", async () => {
		const sessionId = randomUUID();
		const sandboxPath = path.join(tmpDir, `sandbox-${sessionId}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		await adapter.mount({ filesystem: makeFs(vaultDir), sandboxPath, auth: null });

		// Agent edits a file in the vault (via the symlink or directly).
		fs.writeFileSync(path.join(vaultDir, "new-note.md"), "# New Note\n");

		const result = await adapter.captureBack({
			filesystem: makeFs(vaultDir),
			sandboxPath,
			sessionId,
		});

		expect(result.success).toBe(true);
		expect(result.captured).toBe(true);
		const capturePath = path.join(capturesDir, fs.readdirSync(capturesDir)[0]!);
		expect(fs.existsSync(capturePath)).toBe(true);
		// Snapshot contains the edited file.
		expect(fs.existsSync(path.join(capturePath, "new-note.md"))).toBe(true);
		expect(fs.readFileSync(path.join(capturePath, "new-note.md"), "utf-8")).toBe("# New Note\n");
	});

	it("mount: returns success:false when folder does not exist", async () => {
		const sandboxPath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs("/nonexistent/vault/path"),
			sandboxPath,
			auth: null,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("does not exist");
	});
});
