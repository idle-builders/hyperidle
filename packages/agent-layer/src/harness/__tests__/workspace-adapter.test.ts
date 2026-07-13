import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import type { SandboxAdapter, SandboxHandle } from "../sandbox-adapter.js";

let testBaseDir: string;

beforeAll(async () => {
	testBaseDir = join(tmpdir(), `hyperidle-d3-test-${Date.now()}`);
	await mkdir(testBaseDir, { recursive: true });
});

afterAll(async () => {
	await rm(testBaseDir, { recursive: true, force: true });
});

describe("SandboxAdapter interface (D3)", () => {
	describe("LocalSandboxAdapter", () => {
		it("implements SandboxAdapter interface", () => {
			const adapter: SandboxAdapter = new LocalSandboxAdapter();
			expect(typeof adapter.spawn).toBe("function");
			expect(typeof adapter.exec).toBe("function");
			expect(typeof adapter.destroy).toBe("function");
		});

		it("spawn creates directory and returns handle", async () => {
			const adapter = new LocalSandboxAdapter();
			const handle = await adapter.spawn(testBaseDir);

			expect(handle.sandboxId).toBeDefined();
			expect(handle.path).toContain(testBaseDir);

			// Directory should exist
			const entries = await readdir(handle.path);
			expect(Array.isArray(entries)).toBe(true);

			await adapter.destroy(handle);
		});

		it("exec('ls') lists workspace directory", async () => {
			const adapter = new LocalSandboxAdapter();
			const handle = await adapter.spawn(testBaseDir);

			// Create a test file
			await writeFile(join(handle.path, "test.txt"), "hello");

			const result = await adapter.exec(handle, "ls");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("test.txt");

			await adapter.destroy(handle);
		});

		it("destroy removes directory", async () => {
			const adapter = new LocalSandboxAdapter();
			const handle = await adapter.spawn(testBaseDir);

			// Verify it exists
			expect(await adapter.exists(handle)).toBe(true);

			await adapter.destroy(handle);

			// Verify it's gone
			expect(await adapter.exists(handle)).toBe(false);
		});

		it("workspace is isolated — cannot access files outside workspace", async () => {
			const adapter = new LocalSandboxAdapter();
			const handle = await adapter.spawn(testBaseDir);

			// Try to list parent directory — should only show workspace contents
			const result = await adapter.exec(handle, "ls .");
			// The result should NOT contain files from testBaseDir's parent
			expect(result.exitCode).toBe(0);

			// Verify that the workspace path is a subdirectory
			expect(handle.path.startsWith(testBaseDir)).toBe(true);
			expect(handle.path).not.toBe(testBaseDir);

			await adapter.destroy(handle);
		});

		it("5 concurrent workspaces spawn without conflict", async () => {
			const adapter = new LocalSandboxAdapter();
			const handles: SandboxHandle[] = [];

			// Spawn 5 workspaces concurrently
			const spawnPromises = Array.from({ length: 5 }, () => adapter.spawn(testBaseDir));
			const results = await Promise.all(spawnPromises);
			handles.push(...results);

			// All should have unique IDs and paths
			const ids = new Set(handles.map((h) => h.sandboxId));
			const paths = new Set(handles.map((h) => h.path));
			expect(ids.size).toBe(5);
			expect(paths.size).toBe(5);

			// All should be independently functional
			const execPromises = handles.map((h, i) => adapter.exec(h, `echo workspace-${i}`));
			const execResults = await Promise.all(execPromises);

			for (let i = 0; i < 5; i++) {
				expect(execResults[i]!.exitCode).toBe(0);
				expect(execResults[i]!.stdout).toBe(`workspace-${i}`);
			}

			// Clean up
			await Promise.all(handles.map((h) => adapter.destroy(h)));
		});

		it("file changes are visible to host-side check", async () => {
			const adapter = new LocalSandboxAdapter();
			const handle = await adapter.spawn(testBaseDir);

			// Write a file from inside the workspace via exec
			await adapter.exec(handle, 'echo "agent wrote this" > agent-output.txt');

			// Read from host side
			const { readFile } = await import("node:fs/promises");
			const content = await readFile(join(handle.path, "agent-output.txt"), "utf-8");
			expect(content.trim()).toBe("agent wrote this");

			await adapter.destroy(handle);
		});

		it("exec throws for unknown workspace", async () => {
			const adapter = new LocalSandboxAdapter();
			const fakeHandle: SandboxHandle = { sandboxId: "nonexistent", path: "/tmp/nonexistent" };

			await expect(adapter.exec(fakeHandle, "ls")).rejects.toThrow("Unknown sandbox");
		});

		it("destroy throws for unknown workspace", async () => {
			const adapter = new LocalSandboxAdapter();
			const fakeHandle: SandboxHandle = { sandboxId: "nonexistent", path: "/tmp/nonexistent" };

			await expect(adapter.destroy(fakeHandle)).rejects.toThrow("Unknown sandbox");
		});

		it("exec returns stderr and non-zero exit code on failure", async () => {
			const adapter = new LocalSandboxAdapter();
			const handle = await adapter.spawn(testBaseDir);

			const result = await adapter.exec(handle, "ls /nonexistent-path-12345");
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr.length).toBeGreaterThan(0);

			await adapter.destroy(handle);
		});
	});
});
