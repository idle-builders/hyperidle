import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Filesystem } from "@hyperidle/filesystem-contract";
import { describe, expect, it } from "vitest";
import { RegistryFilesystemMounter } from "../index.js";
import type { AdapterDeps } from "../mounter-registry.js";

const deps: AdapterDeps = {
	gitRunnerFactory: () => null as never,
};

function filesystem(overrides: Partial<Filesystem>): Filesystem {
	return {
		id: "fs-test",
		teamId: "team-1",
		source: "gdrive",
		kind: "doc_set",
		connectionId: null,
		resourceRef: { kind: "doc_set", folder: "/tmp" },
		writeback: "file",
		state: "reachable",
		createdAt: "2025-01-01T00:00:00Z",
		...overrides,
	};
}

describe("RegistryFilesystemMounter dispatch", () => {
	it("reports unsupported cloud sources explicitly through the public mount contract", async () => {
		const result = await new RegistryFilesystemMounter(deps).mount({
			filesystem: filesystem({ source: "gdrive" }),
			sandboxPath: "/tmp/sandbox",
		});
		expect(result).toMatchObject({ success: false, error: expect.stringContaining("not built") });
	});

	it("rejects remote code without a connection instead of silently selecting an adapter", async () => {
		const remote = filesystem({
			kind: "code",
			source: "github",
			resourceRef: { kind: "code", repo: "owner/repo", branch: "main" },
		});
		await expect(
			new RegistryFilesystemMounter(deps).mount({
				filesystem: remote,
				sandboxPath: "/tmp/s",
			}),
		).rejects.toThrow("MalformedFilesystem");
	});

	it("does not write excludes through a malicious worktree gitdir pointer", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "au20-gitdir-"));
		const repo = path.join(root, "repo");
		const sandbox = path.join(root, "sandbox");
		const external = path.join(root, ".git", "worktrees", "attacker");
		fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
		fs.rmSync(path.join(repo, ".git"), { recursive: true });
		execFileSync("git", ["init", repo]);
		fs.mkdirSync(external, { recursive: true });
		const maliciousDeps = {
			...deps,
			gitRunnerFactory: () => ({
				worktreeAdd: async () => {
					fs.mkdirSync(sandbox, { recursive: true });
					fs.writeFileSync(path.join(sandbox, ".git"), `gitdir: ${external}\n`);
				},
			}),
		} as unknown as AdapterDeps;
		const result = await new RegistryFilesystemMounter(maliciousDeps).mount({
			filesystem: filesystem({
				kind: "code",
				source: "local",
				resourceRef: { kind: "code", repo, branch: "main" },
			}),
			sandboxPath: sandbox,
		});
		expect(result.success).toBe(true);
		expect(fs.existsSync(path.join(external, "info", "exclude"))).toBe(false);
		fs.rmSync(root, { recursive: true, force: true });
	});
});
