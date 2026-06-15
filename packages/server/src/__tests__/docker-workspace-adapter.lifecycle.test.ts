import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SpawnCall = { file: string; args: readonly string[] };
const spawnCalls: SpawnCall[] = [];
let nextExitCode = 0;
let nextStdout = "container-lifecycle-test\n";

function makeMockChild(stdoutData: string, exitCode: number): EventEmitter {
	const child = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter;
		stderr: EventEmitter;
	};
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	queueMicrotask(() => {
		child.stdout.emit("data", Buffer.from(stdoutData));
		child.emit("close", exitCode);
		child.emit("exit", exitCode);
	});
	return child;
}

vi.mock("node:child_process", async () => {
	const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
	return {
		...actual,
		spawn: (file: string, args: readonly string[]) => {
			spawnCalls.push({ file, args: [...args] });
			return makeMockChild(nextStdout, nextExitCode);
		},
	};
});

// Top-level import: vi.mock is hoisted, so the mock is active before this resolves.
const { DockerSandboxAdapter } = await import("../harness/docker-sandbox-adapter.js");

beforeEach(() => {
	spawnCalls.length = 0;
	nextExitCode = 0;
	nextStdout = "container-lifecycle-test\n";
});

afterEach(() => {
	spawnCalls.length = 0;
});

describe("DockerSandboxAdapter lifecycle", () => {
	it("exec on unknown workspace throws with descriptive message", async () => {
		const adapter = new DockerSandboxAdapter();

		const fakeHandle = { workspaceId: "nonexistent-ws", path: "/tmp/fake" };
		await expect(adapter.exec(fakeHandle, "echo hello")).rejects.toThrow(
			"Unknown sandbox: nonexistent-ws",
		);
	});

	it("destroy on unknown workspace throws with descriptive message", async () => {
		const adapter = new DockerSandboxAdapter();

		const fakeHandle = { workspaceId: "nonexistent-ws", path: "/tmp/fake" };
		await expect(adapter.destroy(fakeHandle)).rejects.toThrow("Unknown sandbox: nonexistent-ws");
	});

	it("spawn throws when docker run exits with non-zero code", async () => {
		nextExitCode = 1;
		nextStdout = "";

		const adapter = new DockerSandboxAdapter();

		await expect(adapter.spawn("/tmp/test-base")).rejects.toThrow(
			"Failed to start Docker container",
		);
	});
});
