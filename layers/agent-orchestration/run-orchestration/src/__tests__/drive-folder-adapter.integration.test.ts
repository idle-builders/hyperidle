/**
 * V6 (Google Drive phase, §9.2/§9.3) — the cheapest thing that would catch a
 * broken wire: `DriveFolderAdapter` through the real `rclone` binary and a
 * real `local`-type remote (zero network, zero Google account). Local-only:
 * gated by `requireBinary("rclone")`, routed through `HARNESS_INCLUDE`.
 *
 * Proves, on the real binary:
 *  - `mount` copies the seeded tree into the kept copy, readable through
 *    `<workspace>/<name>`;
 *  - `-u` (`--update`): the agent's un-copied-back local edit survives a
 *    refresh while the remote file is still older, and IS overwritten once
 *    the remote file becomes newer — the documented residual case (§2.2);
 *  - the agent's own way out — `rclone copy <folder> <remote>:<path>` — puts
 *    a new file into the remote directory, proving `copy` never deleted
 *    anything on the way up either.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRcloneRunner } from "../../../src/rclone-runner.js";
import { RegistryFilesystemMounter } from "../index.js";
import type { Filesystem } from "../mounter.js";
import { requireBinary } from "./require-binary.js";

beforeAll(() => {
	requireBinary("rclone");
});

const dirs: string[] = [];
function tracked(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	vi.unstubAllEnvs();
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fresh, per-test rclone config with one `local`-type remote — never the real `~/.config/rclone`. */
function setUpRemote(name: string): { home: string; source: string } {
	const home = tracked("v6-home-");
	const configDir = path.join(home, ".config", "rclone");
	fs.mkdirSync(configDir, { recursive: true });
	fs.writeFileSync(path.join(configDir, "rclone.conf"), `[${name}]\ntype = local\n`);
	vi.stubEnv("HOME", home);
	vi.stubEnv("XDG_CONFIG_HOME", "");
	const source = path.join(home, "source");
	fs.mkdirSync(source, { recursive: true });
	return { home, source };
}

function makeFs(remote: string, sourcePath: string): Filesystem {
	return {
		id: "fs-drive-v6",
		teamId: "team-1",
		source: "gdrive",
		kind: "doc_set",
		connectionId: null,
		resourceRef: { kind: "drive", remote, path: sourcePath },
		state: "reachable",
		createdAt: "2026-09-16T00:00:00Z",
	};
}

describe("DriveFolderAdapter — real rclone, real local-backend remote", () => {
	it("mount copies the seeded tree into the kept copy, readable through the workspace", async () => {
		const { source } = setUpRemote("v6remote");
		fs.writeFileSync(path.join(source, "readme.txt"), "hello from drive\n");
		fs.mkdirSync(path.join(source, "sub"));
		fs.writeFileSync(path.join(source, "sub", "note.txt"), "nested\n");

		const keptCopiesRoot = tracked("v6-kept-");
		const workspacePath = tracked("v6-ws-");

		const mounter = new RegistryFilesystemMounter({
			gitRunnerFactory: () => {
				throw new Error("not used");
			},
			keptCopiesRoot,
			rclone: createRcloneRunner(),
		});

		const result = await mounter.mount({
			filesystem: makeFs("v6remote", source),
			workspacePath,
			sessionId: "session-1",
			taskId: null,
			folderName: "acme",
			credential: null,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("unreachable");

		const link = path.join(workspacePath, "acme");
		expect(fs.readFileSync(path.join(link, "readme.txt"), "utf8")).toBe("hello from drive\n");
		expect(fs.readFileSync(path.join(link, "sub", "note.txt"), "utf8")).toBe("nested\n");
	});

	it("the --update refresh: an un-copied-back local edit survives while the remote is older, and is overwritten once the remote is newer", async () => {
		const { source } = setUpRemote("v6remote");
		const briefPath = path.join(source, "brief.txt");
		fs.writeFileSync(briefPath, "source v1\n");
		fs.utimesSync(briefPath, new Date("2020-01-01"), new Date("2020-01-01"));

		const keptCopiesRoot = tracked("v6-kept-");
		const rclone = createRcloneRunner();
		const mounter = new RegistryFilesystemMounter({
			gitRunnerFactory: () => {
				throw new Error("not used");
			},
			keptCopiesRoot,
			rclone,
		});
		const filesystem = makeFs("v6remote", source);

		// First mount: the copy gets the 2020 source content.
		const ws1 = tracked("v6-ws1-");
		const first = await mounter.mount({
			filesystem,
			workspacePath: ws1,
			sessionId: "session-1",
			taskId: null,
			folderName: "acme",
			credential: null,
		});
		expect(first.ok).toBe(true);
		if (!first.ok) throw new Error("unreachable");
		expect(fs.readFileSync(path.join(first.mounted.folder, "brief.txt"), "utf8")).toBe(
			"source v1\n",
		);

		// The "agent" edits the copy directly (not pushed back to Drive), with a
		// mtime newer than the source's 2020 stamp.
		const copyBriefPath = path.join(first.mounted.trustedPaths[0] ?? "", "brief.txt");
		fs.writeFileSync(copyBriefPath, "agent edit\n");
		fs.utimesSync(copyBriefPath, new Date("2025-01-01"), new Date("2025-01-01"));

		// A second session, new workspace: the refresh runs again. The source is
		// still 2020 — older than the agent's 2025 edit — so `-u` skips it.
		const ws2 = tracked("v6-ws2-");
		const second = await mounter.mount({
			filesystem,
			workspacePath: ws2,
			sessionId: "session-2",
			taskId: null,
			folderName: "acme",
			credential: null,
		});
		expect(second.ok).toBe(true);
		if (!second.ok) throw new Error("unreachable");
		expect(fs.readFileSync(path.join(second.mounted.folder, "brief.txt"), "utf8")).toBe(
			"agent edit\n",
		);

		// Now Drive-side changes: the source file is updated to 2030 — newer than
		// the agent's un-copied-back 2025 edit. The documented residual case: the
		// next refresh overwrites the agent's edit.
		fs.writeFileSync(briefPath, "source v2\n");
		fs.utimesSync(briefPath, new Date("2030-01-01"), new Date("2030-01-01"));

		const ws3 = tracked("v6-ws3-");
		const third = await mounter.mount({
			filesystem,
			workspacePath: ws3,
			sessionId: "session-3",
			taskId: null,
			folderName: "acme",
			credential: null,
		});
		expect(third.ok).toBe(true);
		if (!third.ok) throw new Error("unreachable");
		expect(fs.readFileSync(path.join(third.mounted.folder, "brief.txt"), "utf8")).toBe(
			"source v2\n",
		);
	});

	it("the agent's own way out — rclone copy <folder> <remote>:<path> — puts a new file into the remote directory", async () => {
		const { source } = setUpRemote("v6remote");
		fs.writeFileSync(path.join(source, "readme.txt"), "hello\n");

		const keptCopiesRoot = tracked("v6-kept-");
		const workspacePath = tracked("v6-ws-");
		const mounter = new RegistryFilesystemMounter({
			gitRunnerFactory: () => {
				throw new Error("not used");
			},
			keptCopiesRoot,
			rclone: createRcloneRunner(),
		});
		const result = await mounter.mount({
			filesystem: makeFs("v6remote", source),
			workspacePath,
			sessionId: "session-1",
			taskId: null,
			folderName: "acme",
			credential: null,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("unreachable");

		// The agent's own command, exactly as `filesystem-instructions.ts` states
		// it: `rclone copy <folder> <remote>:<path>`.
		fs.writeFileSync(path.join(result.mounted.folder, "new-work.txt"), "pushed back\n");
		execFileSync("rclone", [
			"copy",
			result.mounted.folder,
			`v6remote:${source}`,
			"--ask-password=false",
		]);

		expect(fs.readFileSync(path.join(source, "new-work.txt"), "utf8")).toBe("pushed back\n");
		// `copy` never deletes: the original seed file is still there.
		expect(fs.existsSync(path.join(source, "readme.txt"))).toBe(true);
	});
});
