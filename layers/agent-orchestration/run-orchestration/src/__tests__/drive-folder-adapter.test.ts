/**
 * V3 (Google Drive phase, §9.2) — `DriveFolderAdapter`, through the public
 * `RegistryFilesystemMounter`, with a FAKE `RcloneRunner` against real temp
 * directories (the real-binary proof is V6, local-only).
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetKeptCopy, RegistryFilesystemMounter } from "../index.js";
import type { AdapterDeps, Filesystem, MountInput } from "../mounter.js";
import type { RcloneOutcome, RcloneRunner } from "../mounter-ports.js";

function makeFs(remote: string, path_: string): Filesystem {
	return {
		id: "fs-drive-test",
		teamId: "team-1",
		source: "gdrive",
		kind: "doc_set",
		connectionId: null,
		resourceRef: { kind: "drive", remote, path: path_ },
		state: "reachable",
		createdAt: "2026-09-16T00:00:00Z",
	};
}

describe("DriveFolderAdapter (thin, fake rclone)", () => {
	let tmpDir: string;
	let keptCopiesRoot: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ba5-drive-adapter-"));
		keptCopiesRoot = path.join(tmpDir, "kept-copies");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function fakeCopyDown(
		seed?: (destination: string) => void,
	): (remote: string, path: string, destination: string) => Promise<RcloneOutcome<void>> {
		return async (_remote, _path, destination) => {
			seed?.(destination);
			return { ok: true, value: undefined };
		};
	}

	function makeDeps(rclone: RcloneRunner): AdapterDeps {
		return {
			gitRunnerFactory: () => {
				throw new Error("DriveFolderAdapter should not call gitRunnerFactory");
			},
			keptCopiesRoot,
			rclone,
		};
	}

	function makeInput(overrides: Partial<MountInput> & { workspacePath: string }): MountInput {
		return {
			filesystem: makeFs("gdrive", "Projects/Acme"),
			sessionId: "session-1",
			taskId: null,
			folderName: "acme",
			credential: null,
			...overrides,
		};
	}

	it("first mount: copies remote -> the kept copy, symlinks it in, reports trustedPaths and empty agentEnv", async () => {
		const copyDown = vi.fn(
			fakeCopyDown((destination) => {
				fs.writeFileSync(path.join(destination, "brief.txt"), "hello\n");
			}),
		);
		const rclone: RcloneRunner = {
			listRemotes: async () => ({ ok: true, value: ["gdrive"] }),
			statPath: async () => ({ ok: true, value: { isDir: true } }),
			copyDown,
		};

		const workspacePath = path.join(tmpDir, `ws-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });

		const mounter = new RegistryFilesystemMounter(makeDeps(rclone));
		const result = await mounter.mount(makeInput({ workspacePath }));

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("unreachable");

		const copy = path.join(keptCopiesRoot, "fs-drive-test");
		expect(fs.existsSync(copy)).toBe(true);
		expect(copyDown).toHaveBeenCalledTimes(1);
		expect(copyDown).toHaveBeenCalledWith("gdrive", "Projects/Acme", copy);

		const link = path.join(workspacePath, "acme");
		expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(link)).toBe(fs.realpathSync(copy));
		expect(fs.readFileSync(path.join(link, "brief.txt"), "utf8")).toBe("hello\n");

		expect(result.mounted.trustedPaths).toEqual([copy]);
		expect(result.mounted.agentEnv).toEqual({});
		expect(result.mounted.reused).toBe(false);
	});

	it("an empty Drive folder still gives the agent a real folder", async () => {
		const rclone: RcloneRunner = {
			listRemotes: async () => ({ ok: true, value: ["gdrive"] }),
			statPath: async () => ({ ok: true, value: { isDir: true } }),
			copyDown: fakeCopyDown(),
		};
		const workspacePath = path.join(tmpDir, `ws-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });

		const mounter = new RegistryFilesystemMounter(makeDeps(rclone));
		const result = await mounter.mount(makeInput({ workspacePath }));

		expect(result.ok).toBe(true);
		const copy = path.join(keptCopiesRoot, "fs-drive-test");
		expect(fs.existsSync(copy)).toBe(true);
		expect(fs.statSync(copy).isDirectory()).toBe(true);
	});

	it("a second session (new workspace, new session id) reuses the same copy, refreshes it, and keeps a file the first session wrote", async () => {
		const copyDown = vi.fn(fakeCopyDown());
		const rclone: RcloneRunner = {
			listRemotes: async () => ({ ok: true, value: ["gdrive"] }),
			statPath: async () => ({ ok: true, value: { isDir: true } }),
			copyDown,
		};
		const mounter = new RegistryFilesystemMounter(makeDeps(rclone));

		const ws1 = path.join(tmpDir, `ws-${randomUUID()}`);
		fs.mkdirSync(ws1, { recursive: true });
		const first = await mounter.mount(makeInput({ workspacePath: ws1, sessionId: "session-1" }));
		expect(first.ok).toBe(true);
		if (!first.ok) throw new Error("unreachable");
		fs.writeFileSync(path.join(first.mounted.folder, "agent-work.txt"), "not pushed back yet\n");

		const ws2 = path.join(tmpDir, `ws-${randomUUID()}`);
		fs.mkdirSync(ws2, { recursive: true });
		const second = await mounter.mount(makeInput({ workspacePath: ws2, sessionId: "session-2" }));

		expect(second.ok).toBe(true);
		if (!second.ok) throw new Error("unreachable");
		expect(copyDown).toHaveBeenCalledTimes(2);
		const copy = path.join(keptCopiesRoot, "fs-drive-test");
		expect(fs.realpathSync(second.mounted.folder)).toBe(fs.realpathSync(copy));
		expect(fs.readFileSync(path.join(second.mounted.folder, "agent-work.txt"), "utf8")).toBe(
			"not pushed back yet\n",
		);
	});

	it("a resume (same workspace, same link) recognises the existing symlink instead of re-creating it", async () => {
		const rclone: RcloneRunner = {
			listRemotes: async () => ({ ok: true, value: ["gdrive"] }),
			statPath: async () => ({ ok: true, value: { isDir: true } }),
			copyDown: fakeCopyDown(),
		};
		const mounter = new RegistryFilesystemMounter(makeDeps(rclone));
		const workspacePath = path.join(tmpDir, `ws-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });
		const input = makeInput({ workspacePath });

		const first = await mounter.mount(input);
		expect(first.ok).toBe(true);
		if (!first.ok) throw new Error("unreachable");
		expect(first.mounted.reused).toBe(false);

		const second = await mounter.mount(input);
		expect(second.ok).toBe(true);
		if (!second.ok) throw new Error("unreachable");
		expect(second.mounted.reused).toBe(true);
	});

	it("a plain file already at the link path is the collision reason", async () => {
		const rclone: RcloneRunner = {
			listRemotes: async () => ({ ok: true, value: ["gdrive"] }),
			statPath: async () => ({ ok: true, value: { isDir: true } }),
			copyDown: fakeCopyDown(),
		};
		const mounter = new RegistryFilesystemMounter(makeDeps(rclone));
		const workspacePath = path.join(tmpDir, `ws-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });
		fs.writeFileSync(path.join(workspacePath, "acme"), "not a symlink\n");

		const result = await mounter.mount(makeInput({ workspacePath }));

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.reason).toContain("already exists in the workspace");
	});

	it("copyDown failing surfaces the shared drive reason, not a raw rclone error", async () => {
		const rclone: RcloneRunner = {
			listRemotes: async () => ({ ok: true, value: ["gdrive"] }),
			statPath: async () => ({ ok: true, value: { isDir: true } }),
			copyDown: async () => ({ ok: false, code: "directory_not_found", reason: "not found" }),
		};
		const mounter = new RegistryFilesystemMounter(makeDeps(rclone));
		const workspacePath = path.join(tmpDir, `ws-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });

		const result = await mounter.mount(makeInput({ workspacePath }));

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.reason).toBe("Folder `Projects/Acme` is not in the `gdrive` Drive remote");
	});

	it("no rclone port wired at all -> honest 'cannot reach Google Drive' reason, not a stub mount", async () => {
		const deps: AdapterDeps = {
			gitRunnerFactory: () => {
				throw new Error("not used");
			},
			keptCopiesRoot,
		};
		const mounter = new RegistryFilesystemMounter(deps);
		const workspacePath = path.join(tmpDir, `ws-${randomUUID()}`);
		fs.mkdirSync(workspacePath, { recursive: true });

		const result = await mounter.mount(makeInput({ workspacePath }));

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.reason).toBe("this server cannot reach Google Drive");
	});

	it("forgetKeptCopy removes a Drive filesystem's kept copy", async () => {
		const copy = path.join(keptCopiesRoot, "fs-drive-test");
		fs.mkdirSync(copy, { recursive: true });
		fs.writeFileSync(path.join(copy, "note.txt"), "x\n");

		await forgetKeptCopy(keptCopiesRoot, makeFs("gdrive", "Projects/Acme"));

		expect(fs.existsSync(copy)).toBe(false);
	});
});
