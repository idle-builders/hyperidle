/**
 * N4 — log-rotation tests
 *
 * AC coverage:
 *  - createLogRotator() creates the log directory if it does not exist
 *  - createLogRotator() returns a LogRotator with attach(), detach(), writeSync()
 *  - writeSync() writes to server.log in the specified directory
 *  - writeSync() creates the log file on first write
 *  - size-based rotation: when log exceeds maxBytes, old file is rotated to .1
 *  - rotation keeps at most maxFiles rotated copies
 *  - attach() tees process.stdout.write to the log file
 *  - detach() restores the original process.stdout.write
 *  - logPath is server.log inside the provided logDir
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogRotator } from "../src/log-rotation.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-logtest-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("createLogRotator — basic", () => {
	it("returns a LogRotator with the correct logPath", () => {
		const rotator = createLogRotator(tmpDir);
		expect(rotator.logPath).toBe(path.join(tmpDir, "server.log"));
	});

	it("has attach, detach, writeSync methods", () => {
		const rotator = createLogRotator(tmpDir);
		expect(typeof rotator.attach).toBe("function");
		expect(typeof rotator.detach).toBe("function");
		expect(typeof rotator.writeSync).toBe("function");
	});

	it("creates the log directory if it does not exist", () => {
		const nestedDir = path.join(tmpDir, "nested", "logs");
		expect(fs.existsSync(nestedDir)).toBe(false);
		createLogRotator(nestedDir);
		// Directory should be created when the rotator is used (attach or writeSync)
		const rotator = createLogRotator(nestedDir);
		rotator.writeSync("hello\n");
		expect(fs.existsSync(nestedDir)).toBe(true);
	});
});

describe("createLogRotator — writeSync", () => {
	it("writes text to server.log", () => {
		const rotator = createLogRotator(tmpDir);
		rotator.writeSync("test line\n");
		const content = fs.readFileSync(path.join(tmpDir, "server.log"), "utf-8");
		expect(content).toContain("test line");
	});

	it("appends multiple writes to the same file", () => {
		const rotator = createLogRotator(tmpDir);
		rotator.writeSync("line 1\n");
		rotator.writeSync("line 2\n");
		const content = fs.readFileSync(path.join(tmpDir, "server.log"), "utf-8");
		expect(content).toContain("line 1");
		expect(content).toContain("line 2");
	});
});

describe("createLogRotator — size-based rotation", () => {
	it("rotates log file when size exceeds maxBytes", () => {
		const maxBytes = 100;
		const rotator = createLogRotator(tmpDir, { maxBytes, maxFiles: 3 });

		// Write enough data to trigger rotation (> 100 bytes)
		const line = "a".repeat(60);
		rotator.writeSync(`${line}\n`); // ~61 bytes
		rotator.writeSync(`${line}\n`); // ~122 bytes total → should rotate

		// After rotation, server.log.1 should exist
		expect(fs.existsSync(path.join(tmpDir, "server.log.1"))).toBe(true);
	});

	it("rotates up to maxFiles copies, deleting the oldest", () => {
		const maxBytes = 50;
		const maxFiles = 2;
		const rotator = createLogRotator(tmpDir, { maxBytes, maxFiles });

		// Write enough for 3+ rotations
		for (let i = 0; i < 5; i++) {
			rotator.writeSync(`${"x".repeat(60)}\n`);
		}

		// With maxFiles=2, only server.log.1 and server.log.2 should exist
		expect(fs.existsSync(path.join(tmpDir, "server.log.1"))).toBe(true);
		expect(fs.existsSync(path.join(tmpDir, "server.log.2"))).toBe(true);
		// server.log.3 should NOT exist (maxFiles=2 means keep 2 rotated copies)
		expect(fs.existsSync(path.join(tmpDir, "server.log.3"))).toBe(false);
	});

	it("new server.log is created after rotation", () => {
		const maxBytes = 50;
		const rotator = createLogRotator(tmpDir, { maxBytes, maxFiles: 3 });
		rotator.writeSync(`${"x".repeat(60)}\n`);
		rotator.writeSync(`${"y".repeat(10)}\n`); // triggers rotation

		// new server.log should exist and be smaller than maxBytes
		const stat = fs.statSync(path.join(tmpDir, "server.log"));
		expect(stat.size).toBeLessThan(maxBytes);
	});
});

describe("createLogRotator — attach/detach", () => {
	it("tees process.stdout.write to the log file after attach()", () => {
		const rotator = createLogRotator(tmpDir);
		rotator.attach();
		try {
			process.stdout.write("teed-output\n");
			const content = fs.readFileSync(path.join(tmpDir, "server.log"), "utf-8");
			expect(content).toContain("teed-output");
		} finally {
			rotator.detach();
		}
	});

	it("restores original process.stdout.write after detach()", () => {
		const rotator = createLogRotator(tmpDir);
		rotator.attach();
		rotator.detach();
		// After detach, process.stdout.write should be restored
		// We verify by checking it still works without writing to our log
		expect(process.stdout.write).toBeDefined();
		// The restored function should not be the patched version
		// (write to stdout should not create new entries in log after detach)
		const sizeBefore = fs.existsSync(path.join(tmpDir, "server.log"))
			? fs.statSync(path.join(tmpDir, "server.log")).size
			: 0;
		process.stdout.write("after-detach\n");
		const sizeAfter = fs.existsSync(path.join(tmpDir, "server.log"))
			? fs.statSync(path.join(tmpDir, "server.log")).size
			: 0;
		expect(sizeAfter).toBe(sizeBefore);
	});
});
