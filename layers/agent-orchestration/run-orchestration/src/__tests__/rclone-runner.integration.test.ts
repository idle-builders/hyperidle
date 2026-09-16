/**
 * V1 (Google Drive phase, §9.2) — `createRcloneRunner`, through the REAL
 * `rclone` binary against a `local`-type remote (zero network, zero Google
 * account). Local-only: gated by `requireBinary("rclone")`, routed through
 * `HARNESS_INCLUDE` (`vitest.integration.config.ts`) so an absent binary
 * hard-fails locally rather than the service lane silently skipping to
 * green.
 *
 * The remote's own config file lives entirely under a per-test temp `HOME`
 * (`XDG_CONFIG_HOME`/`HOME`/`PATH`, stubbed with `vi.stubEnv` and unstubbed
 * in this file's own `afterEach` — the harness project, unlike the service
 * project, does not set `unstubEnvs: true`) — never the real `$HOME` or the
 * real `~/.config/rclone/rclone.conf`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRcloneRunner } from "../../../src/rclone-runner.js";
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
function setUpRemote(name: string): { home: string } {
	const home = tracked("rclone-v1-home-");
	const configDir = path.join(home, ".config", "rclone");
	fs.mkdirSync(configDir, { recursive: true });
	fs.writeFileSync(path.join(configDir, "rclone.conf"), `[${name}]\ntype = local\n`);
	vi.stubEnv("HOME", home);
	vi.stubEnv("XDG_CONFIG_HOME", "");
	return { home };
}

/** Real PATH with every directory that resolves `rclone` removed. */
function pathWithoutRclone(): string {
	const real = process.env.PATH ?? "";
	const kept = real.split(path.delimiter).filter((dir) => {
		if (!dir) return false;
		return !fs.existsSync(path.join(dir, "rclone"));
	});
	return kept.join(path.delimiter);
}

describe("createRcloneRunner — listRemotes", () => {
	it("returns the configured remote name, trailing ':' stripped", async () => {
		setUpRemote("v1remote");
		const runner = createRcloneRunner();
		const result = await runner.listRemotes();
		expect(result).toEqual({ ok: true, value: ["v1remote"] });
	});

	it("reports not_installed when rclone is absent from PATH", async () => {
		setUpRemote("v1remote");
		vi.stubEnv("PATH", pathWithoutRclone());
		const runner = createRcloneRunner();
		const result = await runner.listRemotes();
		expect(result.ok).toBe(false);
		expect(!result.ok && result.code).toBe("not_installed");
	});
});

describe("createRcloneRunner — statPath", () => {
	it("reports isDir:true for a real subfolder", async () => {
		const { home } = setUpRemote("v1remote");
		const folder = path.join(home, "sub");
		fs.mkdirSync(folder);
		const runner = createRcloneRunner();
		const result = await runner.statPath("v1remote", folder);
		expect(result).toEqual({ ok: true, value: { isDir: true } });
	});

	it("maps exit 3 (directory not found) to directory_not_found for a missing path", async () => {
		const { home } = setUpRemote("v1remote");
		const runner = createRcloneRunner();
		const result = await runner.statPath("v1remote", path.join(home, "does-not-exist"));
		expect(result.ok).toBe(false);
		expect(!result.ok && result.code).toBe("directory_not_found");
	});
});

describe("createRcloneRunner — copyDown", () => {
	it("copies a real folder's contents with --drive-skip-gdocs accepted against a local backend", async () => {
		const { home } = setUpRemote("v1remote");
		const source = path.join(home, "source");
		fs.mkdirSync(source);
		fs.writeFileSync(path.join(source, "note.txt"), "hello v1\n");
		const destination = tracked("rclone-v1-dest-");

		const runner = createRcloneRunner();
		const result = await runner.copyDown("v1remote", source, destination);

		expect(result).toEqual({ ok: true, value: undefined });
		expect(fs.readFileSync(path.join(destination, "note.txt"), "utf8")).toBe("hello v1\n");
	});
});

describe("createRcloneRunner — env allow-list", () => {
	it("forwards XDG_CONFIG_HOME — a config that lives ONLY there is still found", async () => {
		// rclone reads XDG_CONFIG_HOME before ~/.config (its own documented
		// precedence). HOME here has no rclone config at all — if the runner
		// dropped XDG_CONFIG_HOME from the child env, this remote would stop
		// being found.
		const home = tracked("rclone-v1-home-noconf-");
		const xdgConfigHome = tracked("rclone-v1-xdg-");
		fs.mkdirSync(path.join(xdgConfigHome, "rclone"), { recursive: true });
		fs.writeFileSync(
			path.join(xdgConfigHome, "rclone", "rclone.conf"),
			"[xdgremote]\ntype = local\n",
		);
		vi.stubEnv("HOME", home);
		vi.stubEnv("XDG_CONFIG_HOME", xdgConfigHome);

		const runner = createRcloneRunner();
		const result = await runner.listRemotes();
		expect(result).toEqual({ ok: true, value: ["xdgremote"] });
	});
});
