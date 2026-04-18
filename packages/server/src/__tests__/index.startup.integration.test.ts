/**
 * I2 — A6: Server fails fast when HYPERIDLE_API_KEY is unset.
 *
 * Today `index.ts` does not check for the env var; the auth middleware
 * silently rejects every request and the operator has no startup signal.
 * Under I2 the entrypoint asserts the env var and `process.exit(1)`s with
 * an explicit error message.
 *
 * Verified via subprocess (mirroring `websocket.test.ts:34-44`): spawn
 * `bun src/index.ts` with HYPERIDLE_API_KEY scrubbed from the env. Assert
 *  - exit code != 0 within 3s,
 *  - stderr (or combined output) mentions "HYPERIDLE_API_KEY".
 *
 * Red phase: today's `index.ts` boots, prints a "Server running" line, and
 * never exits. Both assertions fail.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

describe("I2 A6 — index.ts fails fast on missing HYPERIDLE_API_KEY", () => {
	let proc: ChildProcess | null = null;
	let tmpDir: string | null = null;

	afterAll(() => {
		if (proc && proc.exitCode === null) proc.kill("SIGKILL");
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("exits non-zero with a stderr message naming HYPERIDLE_API_KEY", async () => {
		const port = 10000 + Math.floor(Math.random() * 50000);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "i2-startup-no-key-"));
		const dbPath = path.join(tmpDir, "test.db");

		const serverRoot = resolve(__dirname, "../..");

		// Build a clean env that EXPLICITLY removes HYPERIDLE_API_KEY.
		const cleanEnv = { ...process.env };
		delete cleanEnv.HYPERIDLE_API_KEY;
		cleanEnv.PORT = String(port);
		cleanEnv.DATABASE_URL = dbPath;
		cleanEnv.NODE_ENV = "test";

		proc = spawn("bun", ["run", "src/index.ts"], {
			cwd: serverRoot,
			env: cleanEnv,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stderr = "";
		let stdout = "";
		proc.stdout?.on("data", (b: Buffer) => {
			stdout += b.toString();
		});
		proc.stderr?.on("data", (b: Buffer) => {
			stderr += b.toString();
		});

		const exitInfo = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
			(resolveExit, rejectExit) => {
				const timer = setTimeout(() => {
					rejectExit(new Error("Server did not exit within 3s"));
				}, 3000);
				proc?.on("exit", (code, signal) => {
					clearTimeout(timer);
					resolveExit({ code, signal });
				});
				proc?.on("error", (err) => {
					clearTimeout(timer);
					rejectExit(err);
				});
			},
		);

		// Should have exited with a non-zero code. (Bun maps process.exit(1)
		// to code === 1; we just require it to be non-zero.)
		expect(exitInfo.code).not.toBe(0);
		expect(exitInfo.code).not.toBeNull();

		// And the operator-facing message must mention the env var name.
		const combined = `${stdout}\n${stderr}`;
		expect(combined).toMatch(/HYPERIDLE_API_KEY/);
	}, 8000);
});
