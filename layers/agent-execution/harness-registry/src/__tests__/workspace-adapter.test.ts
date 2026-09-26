import { access, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import type { SandboxHandle } from "../sandbox-adapter.js";

let testBaseDir: string;

beforeAll(async () => {
	testBaseDir = join(tmpdir(), `hyperidle-sandbox-test-${Date.now()}`);
	await mkdir(testBaseDir, { recursive: true });
});

afterAll(async () => {
	await rm(testBaseDir, { recursive: true, force: true });
});

describe("LocalSandboxAdapter", () => {
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

	it("destroy removes directory", async () => {
		const adapter = new LocalSandboxAdapter();
		const handle = await adapter.spawn(testBaseDir);

		// Verify it exists via native fs
		await expect(access(handle.path)).resolves.toBeUndefined();

		await adapter.destroy(handle);

		// Verify it's gone
		await expect(access(handle.path)).rejects.toThrow();
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

		// Clean up
		await Promise.all(handles.map((h) => adapter.destroy(h)));
	});

	it("destroy throws for unknown workspace", async () => {
		const adapter = new LocalSandboxAdapter();
		const fakeHandle: SandboxHandle = { sandboxId: "nonexistent", path: "/tmp/nonexistent" };

		await expect(adapter.destroy(fakeHandle)).rejects.toThrow("Unknown sandbox");
	});
});
