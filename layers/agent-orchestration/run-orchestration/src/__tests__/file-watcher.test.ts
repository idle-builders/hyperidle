/**
 * AU21 §9 Increment 8, Decision F2: relocated wholesale from
 * `layers/core-api/filesystems/src/__tests__/filesystems-completeness-contract.integration.test.ts`
 * — `startWatcher` moved into this package (see `../file-watcher.ts`'s top
 * `@lore`); these are the same watcher-behavior assertions, unchanged,
 * following the implementation to its new home. The registry-CRUD/mounter
 * coverage in the old contract test is unaffected and stays in
 * `@hyperidle/filesystems` (that Service still owns those tables/rows).
 *
 * The final describe block (context.ts's failure-callback wiring) also moves
 * here — it exercises `createContextAssembler`, which lives in THIS package,
 * so a relative import replaces the old dynamic cross-package import.
 */
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { DomainEvent, EventBus } from "@hyperidle/event-bus";
import { afterEach, describe, expect, type Mock, test, vi } from "vitest";
import { createContextAssembler } from "../context.js";
import { startWatcher } from "../file-watcher.js";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return { ...actual, watch: vi.fn(actual.watch) };
});

const temporaryDirectories: string[] = [];

function temporaryDirectory(label: string): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), `au21-inc8-filewatcher-${label}-`));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

function fakeFsWatcher() {
	const watcher = new EventEmitter() as EventEmitter & fs.FSWatcher;
	watcher.close = vi.fn();
	watcher.ref = vi.fn(() => watcher);
	watcher.unref = vi.fn(() => watcher);
	return watcher;
}

type FakeWatch = (
	dir: fs.PathLike,
	options: { recursive: boolean },
	listener: (eventType: string, filename: string | null) => void,
) => fs.FSWatcher;

describe("startWatcher (relocated wholesale from @hyperidle/filesystems)", () => {
	test("watcher emits one debounced batch for watched roots, ignores outside paths, and stop flushes", async () => {
		const sandbox = temporaryDirectory("watcher");
		fs.mkdirSync(path.join(sandbox, "knowledge"));
		fs.mkdirSync(path.join(sandbox, "work"));
		fs.mkdirSync(path.join(sandbox, "outside"));
		const events: DomainEvent[] = [];
		const eventBus = { emit: (event: DomainEvent) => void events.push(event) } as EventBus;
		const watcher = startWatcher({
			sandboxPath: sandbox,
			sessionId: "session-watcher-contract",
			manifestPath: path.join(sandbox, "manifest.json"),
			eventBus,
			debounceMs: 40,
			onError: vi.fn(),
		});

		// Darwin's recursive FSEvents watcher may not be ready until the next turn.
		await new Promise((resolve) => setTimeout(resolve, 75));
		fs.writeFileSync(path.join(sandbox, "outside", "ignored.md"), "ignored");
		fs.writeFileSync(path.join(sandbox, "knowledge", "one.md"), "one");
		fs.writeFileSync(path.join(sandbox, "work", "two.md"), "two");
		await new Promise((resolve) => setTimeout(resolve, 400));
		watcher.stop();

		const writebackEvents = events.filter(
			(event) => event.type === "sandbox_writeback_changes_detected",
		);
		expect(writebackEvents.length).toBeGreaterThanOrEqual(1);
		expect(writebackEvents.every((event) => event.streamId === "session-watcher-contract")).toBe(
			true,
		);
		const changes = writebackEvents.flatMap((event) =>
			event.type === "sandbox_writeback_changes_detected" ? event.changes : [],
		);
		expect(changes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ relativePath: "knowledge/one.md" }),
				expect.objectContaining({ relativePath: "work/two.md" }),
			]),
		);
		expect(JSON.stringify(writebackEvents)).not.toContain("ignored.md");
	});

	test("partial watcher setup failure closes prior watchers and throws synchronously", () => {
		const sandbox = temporaryDirectory("watcher-setup-failure");
		fs.mkdirSync(path.join(sandbox, "knowledge"));
		fs.mkdirSync(path.join(sandbox, "work"));
		const first = fakeFsWatcher();
		const setupError = new Error("work watcher setup failed");
		const watch = (fs.watch as unknown as Mock<FakeWatch>)
			.mockImplementationOnce(() => first)
			.mockImplementationOnce(() => {
				throw setupError;
			});

		expect(() =>
			startWatcher({
				sandboxPath: sandbox,
				sessionId: "session-setup-failure",
				manifestPath: path.join(sandbox, "manifest.json"),
				eventBus: { emit: vi.fn() } as unknown as EventBus,
				onError: vi.fn(),
			}),
		).toThrow(setupError);
		expect(first.close).toHaveBeenCalledOnce();
		watch.mockRestore();
	});

	test("first runtime watcher error closes all ingestion and suppresses pending and later writes", () => {
		vi.useFakeTimers();
		const sandbox = temporaryDirectory("watcher-runtime-failure");
		const knowledge = path.join(sandbox, "knowledge");
		fs.mkdirSync(knowledge);
		fs.mkdirSync(path.join(sandbox, "work"));
		fs.writeFileSync(path.join(knowledge, "pending.md"), "pending");
		const watchers = [fakeFsWatcher(), fakeFsWatcher()];
		const changeListeners: Array<(eventType: string, filename: string | null) => void> = [];
		const watch = (fs.watch as unknown as Mock<FakeWatch>).mockImplementation(
			(_dir, _options, listener) => {
				changeListeners.push(listener as (eventType: string, filename: string | null) => void);
				return watchers[changeListeners.length - 1]!;
			},
		);
		const emit = vi.fn();
		const onError = vi.fn();
		const watcher = startWatcher({
			sandboxPath: sandbox,
			sessionId: "session-runtime-failure",
			manifestPath: path.join(sandbox, "manifest.json"),
			eventBus: { emit } as unknown as EventBus,
			debounceMs: 25,
			onError,
		} as Parameters<typeof startWatcher>[0] & { onError(error: unknown): void });

		changeListeners[0]?.("change", "pending.md");
		const runtimeError = new Error("knowledge watcher failed");
		watchers[0]!.emit("error", runtimeError);
		watchers[1]!.emit("error", new Error("later duplicate"));
		changeListeners[1]?.("change", "later.md");
		vi.advanceTimersByTime(100);
		watcher.stop();
		watcher.stop();

		expect(onError).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledWith(runtimeError);
		expect(watchers.map((entry) => vi.mocked(entry.close).mock.calls.length)).toEqual([1, 1]);
		expect(emit).not.toHaveBeenCalled();
		watch.mockRestore();
		vi.useRealTimers();
	});

	test("orchestration supplies a failure callback that logs context and stops ingestion", async () => {
		let watcherConfig:
			| (Parameters<typeof startWatcher>[0] & { onError(error: unknown): void })
			| undefined;
		const stop = vi.fn();
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		// `ContextAssemblyPorts` is just `filesystems` (Increment 12 Wave C) —
		// `beginAgentWriteback` only ever touches it.
		const assembler = createContextAssembler({
			filesystems: {
				startWatcher: (config) => {
					watcherConfig = config as typeof watcherConfig;
					return { stop };
				},
			},
		});
		const handle = assembler.beginAgentWriteback({
			sandboxPath: "/tmp/failing-sandbox",
			sessionId: "session-orchestration-failure",
			manifestPath: "/tmp/failing-sandbox/.fabric/manifest.json",
			eventBus: { emit: vi.fn() } as unknown as EventBus,
		});

		expect(watcherConfig?.onError).toEqual(expect.any(Function));
		watcherConfig?.onError(new Error("watch failed"));
		expect(stop).toHaveBeenCalledOnce();
		expect(consoleError.mock.calls.flat().join(" ")).toContain("session-orchestration-failure");
		expect(consoleError.mock.calls.flat().join(" ")).toContain("/tmp/failing-sandbox");
		handle.dispose();
		expect(stop).toHaveBeenCalledOnce();
		consoleError.mockRestore();
	});
});
