import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedWatcher, type DebouncedBatch } from "../debounce.js";

describe("createDebouncedWatcher", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires batch after quiet period", async () => {
		const batches: DebouncedBatch[] = [];
		const watcher = createDebouncedWatcher((batch) => {
			batches.push(batch);
		}, 200);

		watcher.push({ path: "knowledge/foo.md", type: "create" });

		expect(batches).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(200);

		expect(batches).toHaveLength(1);
		expect(batches[0]!.changes).toHaveLength(1);
		expect(batches[0]!.changes[0]!.path).toBe("knowledge/foo.md");

		watcher.destroy();
	});

	it("collapses events for same path (last event wins)", async () => {
		const batches: DebouncedBatch[] = [];
		const watcher = createDebouncedWatcher((batch) => {
			batches.push(batch);
		}, 200);

		watcher.push({ path: "knowledge/foo.md", type: "create" });
		watcher.push({ path: "knowledge/foo.md", type: "modify" });
		watcher.push({ path: "knowledge/foo.md", type: "delete" });

		await vi.advanceTimersByTimeAsync(200);

		expect(batches).toHaveLength(1);
		expect(batches[0]!.changes).toHaveLength(1);
		expect(batches[0]!.changes[0]!.type).toBe("delete");

		watcher.destroy();
	});

	it("AC4: 10 files in 200ms debounce collapses to <=10 writeback operations", async () => {
		const batches: DebouncedBatch[] = [];
		const watcher = createDebouncedWatcher((batch) => {
			batches.push(batch);
		}, 200);

		// Push 10 distinct files rapidly
		for (let i = 0; i < 10; i++) {
			watcher.push({ path: `knowledge/file-${i}.md`, type: "create" });
		}

		await vi.advanceTimersByTimeAsync(200);

		expect(batches).toHaveLength(1);
		// Each file is distinct, so we get exactly 10 changes
		expect(batches[0]!.changes).toHaveLength(10);

		watcher.destroy();
	});

	it("resets timer on new event within quiet period", async () => {
		const batches: DebouncedBatch[] = [];
		const watcher = createDebouncedWatcher((batch) => {
			batches.push(batch);
		}, 200);

		watcher.push({ path: "knowledge/a.md", type: "create" });
		await vi.advanceTimersByTimeAsync(100);
		// New event resets timer
		watcher.push({ path: "knowledge/b.md", type: "create" });
		await vi.advanceTimersByTimeAsync(100);
		// Only 100ms since last event
		expect(batches).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(100);
		// Now 200ms since last event
		expect(batches).toHaveLength(1);
		expect(batches[0]!.changes).toHaveLength(2);

		watcher.destroy();
	});

	it("flush() fires immediately and cancels timer", async () => {
		const batches: DebouncedBatch[] = [];
		const watcher = createDebouncedWatcher((batch) => {
			batches.push(batch);
		}, 200);

		watcher.push({ path: "knowledge/foo.md", type: "create" });

		await watcher.flush();

		expect(batches).toHaveLength(1);

		// Advancing timer should not fire again
		await vi.advanceTimersByTimeAsync(200);
		expect(batches).toHaveLength(1);

		watcher.destroy();
	});

	it("destroy() prevents further events", async () => {
		const batches: DebouncedBatch[] = [];
		const watcher = createDebouncedWatcher((batch) => {
			batches.push(batch);
		}, 200);

		watcher.destroy();
		watcher.push({ path: "knowledge/foo.md", type: "create" });

		await vi.advanceTimersByTimeAsync(200);
		expect(batches).toHaveLength(0);
	});
});
