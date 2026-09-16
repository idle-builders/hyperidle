/**
 * V1 (Google Drive phase, §9.2) — `createRcloneRunner`'s `copyDown` argv, via
 * a shell shim on `PATH` that records the child's exact argv. Needs no real
 * `rclone` binary — the shim replaces it entirely — so this runs as a plain
 * unit test, not gated by `requireBinary`. The real-`rclone` behavioral cases
 * stay in `rclone-runner.integration.test.ts`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRcloneRunner } from "../../../src/rclone-runner.js";

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

describe("createRcloneRunner — copyDown argv", () => {
	/**
	 * @lore BA5 phase-2 review finding 1: none of the other cases here can see
	 * a wrong verb, a dropped flag, or a reversed direction (V6 case 2's
	 * source/dest hold the same file so `sync` deletes nothing; V6 case 3 and
	 * V1's gdocs case never go through the runner's own argv-building at
	 * all). Recording the child's real argv, rather than only its behavior,
	 * is the only way to pin the exact command line. The shim replaces
	 * `rclone` on PATH entirely — it never touches the real binary or the
	 * real `~/.config/rclone`, and is created in a temp dir at test time
	 * (development-only artifact, never committed).
	 */
	function installArgvRecordingShim(): { argsFile: string } {
		const binDir = tracked("rclone-argv-bin-");
		const argsFile = path.join(tracked("rclone-argv-out-"), "argv.txt");
		fs.writeFileSync(path.join(binDir, "rclone"), `#!/bin/sh\necho "$@" >> "${argsFile}"\n`, {
			mode: 0o755,
		});
		vi.stubEnv("PATH", `${binDir}${path.delimiter}${process.env.PATH ?? ""}`);
		return { argsFile };
	}

	it("spawns exactly `copy r:p /d --drive-skip-gdocs -u --ask-password=false`", async () => {
		const { argsFile } = installArgvRecordingShim();
		const runner = createRcloneRunner();

		await runner.copyDown("r", "p", "/d");

		const recorded = fs.readFileSync(argsFile, "utf8").trim();
		expect(recorded).toBe("copy r:p /d --drive-skip-gdocs -u --ask-password=false");
	});
});
