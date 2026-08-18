/**
 * AO2 — LocalFolderAdapter integration test (thin).
 *
 * AC1: mount symlinks the folder into sandboxPath; files accessible.
 * AC2: captureBack is a declared no-op (AU43 stage 2 — write code removed).
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
	let vaultDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-folder-adapter-"));
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
		};
	}

	it("mount: symlinks the vault into sandboxPath/<basename>", async () => {
		const sandboxPath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs(vaultDir),
			sandboxPath,
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

	it("captureBack: returns success no-op (write code removed in AU43 stage 2)", async () => {
		const sessionId = randomUUID();
		const sandboxPath = path.join(tmpDir, `sandbox-${sessionId}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		await adapter.mount({ filesystem: makeFs(vaultDir), sandboxPath });

		const result = await adapter.captureBack({
			filesystem: makeFs(vaultDir),
			sandboxPath,
			sessionId,
		});

		expect(result.success).toBe(true);
		expect(result.captured).toBe(false);
	});

	it("mount: returns success:false when folder does not exist", async () => {
		const sandboxPath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs("/nonexistent/vault/path"),
			sandboxPath,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("does not exist");
	});
});
