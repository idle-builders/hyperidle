/**
 * I2 — S5/S6: DockerWorkspaceAdapter must use `child_process.spawn` with
 * an argv array, not shell-string interpolation.
 *
 * Today the adapter does:
 *   execAsync(`docker exec ${id} sh -c "${command.replace(/"/g, '\\"')}"`)
 * — which means a `command` containing `$(cat /etc/passwd)` is expanded by
 * the host shell before it reaches the container. The fix: pass argv as
 * `["docker", "exec", id, "sh", "-c", command]` to `spawn` so the host
 * shell never sees the payload.
 *
 * Red phase: these tests mock `node:child_process` and assert `spawn` is
 * called with an argv array. Against the current adapter, `spawn` is never
 * called (it uses `exec` via `promisify`), so the assertions fail.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture every spawn invocation. Each test reads `spawnCalls` afterward.
type SpawnCall = { file: string; args: readonly string[]; opts?: Record<string, unknown> };
const spawnCalls: SpawnCall[] = [];

/** Build a minimal ChildProcess-like mock that completes successfully. */
function makeMockChild(stdoutData: string, exitCode = 0): EventEmitter {
	const child = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter;
		stderr: EventEmitter;
	};
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	// Defer emission so the consumer attaches listeners first.
	queueMicrotask(() => {
		child.stdout.emit("data", Buffer.from(stdoutData));
		child.emit("close", exitCode);
		child.emit("exit", exitCode);
	});
	return child;
}

// Mock the spawn entrypoint; the I2 adapter is expected to use it.
//
// We do NOT mock `exec` — today's pre-fix adapter uses `promisify(exec)`,
// which then fails at runtime against the un-mocked host shell. That
// failure mode IS the red-phase signal: the test fails before reaching
// the assertion. After the I2 rewrite (exec → spawn), this mock catches
// the call and the assertions about argv shape execute and prove the fix.
vi.mock("node:child_process", async () => {
	const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
	return {
		...actual,
		spawn: (file: string, args: readonly string[], opts?: Record<string, unknown>) => {
			spawnCalls.push({ file, args: [...args], opts });
			const stdout = file === "docker" && args[0] === "run" ? "container-abc123\n" : "";
			return makeMockChild(stdout, 0);
		},
	};
});

beforeEach(() => {
	spawnCalls.length = 0;
});

afterEach(() => {
	spawnCalls.length = 0;
});

describe("I2 S5/S6 — DockerWorkspaceAdapter shell-injection safety", () => {
	it("S5: exec() passes a command with shell metacharacters as a single literal argv element", async () => {
		const { DockerWorkspaceAdapter } = await import("../docker-workspace-adapter.js");
		const adapter = new DockerWorkspaceAdapter();

		const handle = await adapter.spawn("/tmp/dummy-base");
		// Drop the spawn-time docker run call so we only assert on the exec.
		spawnCalls.length = 0;

		const PAYLOAD = "$(cat /etc/passwd); rm -rf / && echo INJECTED";
		await adapter.exec(handle, PAYLOAD);

		// Exactly one spawn for the exec.
		expect(spawnCalls).toHaveLength(1);
		const call = spawnCalls[0];

		// Must be the docker binary (no shell wrapping).
		expect(call.file).toBe("docker");
		// shell option must not be enabled (default: false). If the adapter
		// passes `shell: true` the host shell would interpret the payload.
		expect(call.opts?.shell).not.toBe(true);

		// The payload must appear verbatim as ONE element in argv (no
		// pre-expansion, no quote-stripping).
		expect(call.args).toContain(PAYLOAD);

		// The args should look like ["exec", "<id>", "sh", "-c", PAYLOAD].
		expect(call.args[0]).toBe("exec");
		expect(call.args[call.args.length - 1]).toBe(PAYLOAD);
	});

	it("S6: spawn() (workspace creation) builds argv as an array — no interpolation", async () => {
		const { DockerWorkspaceAdapter } = await import("../docker-workspace-adapter.js");
		const adapter = new DockerWorkspaceAdapter({
			image: "node:20",
			// Inject a metacharacter into mountPath. With the safe argv form
			// this stays as one argv element; with shell interpolation it
			// would get split.
			mountPath: "/work;evil",
		});

		await adapter.spawn("/tmp/dummy-base");

		// At least one call: the `docker run ...`.
		const runCall = spawnCalls.find((c) => c.args[0] === "run");
		expect(runCall, "expected a `docker run` spawn call").toBeDefined();
		if (!runCall) return;

		expect(runCall.file).toBe("docker");
		expect(runCall.opts?.shell).not.toBe(true);

		// The mountPath argument should appear verbatim as a single element.
		// `-v <hostPath>:<mountPath>` — the value is one argv string with the
		// `;` preserved literally.
		const vArg = runCall.args[runCall.args.indexOf("-v") + 1];
		expect(typeof vArg).toBe("string");
		expect(vArg).toMatch(/:\/work;evil$/);

		// And as the working directory.
		const wArg = runCall.args[runCall.args.indexOf("-w") + 1];
		expect(wArg).toBe("/work;evil");
	});

	it("S6: destroy() uses argv form too (no shell interpolation around container id)", async () => {
		const { DockerWorkspaceAdapter } = await import("../docker-workspace-adapter.js");
		const adapter = new DockerWorkspaceAdapter();

		const handle = await adapter.spawn("/tmp/dummy-base");
		spawnCalls.length = 0;

		await adapter.destroy(handle);

		const stopCall = spawnCalls.find((c) => c.args[0] === "stop");
		expect(stopCall, "expected a `docker stop` spawn call").toBeDefined();
		if (!stopCall) return;
		expect(stopCall.file).toBe("docker");
		expect(stopCall.opts?.shell).not.toBe(true);
	});
});
