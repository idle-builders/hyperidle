/**
 * Regression guard: CliHarnessAdapter.deliver preserves `this` when stored
 * in a sessionRunRegistry closure and called via deliverToConversation.
 *
 * The bug: `const fn = adapter.deliver; fn(handle, text)` — unbound, so
 * `this.config` is undefined at runtime. The fix: call as
 * `adapter.deliver?.(handle, text)` inside the closure.
 */
import type { ChildProcess, spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { CliHarnessAdapter } from "@hyperidle/harness-registry";
import { sessionRunRegistry } from "@hyperidle/session-requests";
import { describe, expect, it } from "vitest";

function makeTestAdapter() {
	const fakeStdin = new PassThrough();
	const fakeStdout = new PassThrough();
	const fakeStderr = new PassThrough();
	const written: string[] = [];
	fakeStdin.on("data", (chunk: Buffer) => {
		written.push(chunk.toString());
	});

	const fakeSpawn = () =>
		({
			pid: 88888,
			stdin: fakeStdin,
			stdout: fakeStdout,
			stderr: fakeStderr,
			on: (_ev: string, _cb: unknown) => {},
			kill: () => {},
		}) as unknown as ChildProcess;

	const adapter = new CliHarnessAdapter(
		{
			binary: "claude",
			args: ["--model", "{{model}}", "--input-format", "stream-json", "--replay-user-messages"],
			envMap: {},
			eventFormat: "ndjson",
			envAllowlist: [],
			stdinDelivery: "json-stream",
		},
		{ spawnFn: fakeSpawn as unknown as typeof spawn },
	);

	return { adapter, written };
}

describe("deliver binding — sessionRunRegistry wiring", () => {
	it("writes JSON line to stdin via deliverToConversation with bound closure", async () => {
		const { adapter, written } = makeTestAdapter();

		const handle = await adapter.startSession({
			sessionId: "deliver-bind-test-session",
			sandboxPath: "/tmp/fake-deliver-bind",
			assembledPrompt: "",
			instruction: "test instruction",
			modelTier: "fast",
			tools: [],
		});

		const registryKey = "deliver-bind-test-reg";
		const agentId = "deliver-bind-agent";
		const threadId = "deliver-bind-thread";

		// Buggy pattern (pre-fix): capturing the method as an unbound ref loses `this`.
		// Uncomment to reproduce the regression:
		//   const adapterDeliver = adapter.deliver;
		//   deliver: (text: string) => adapterDeliver(handle, text),  // TypeError: this.config undefined
		//
		// Fixed pattern: call via optional-chaining method expression, `this` preserved.
		sessionRunRegistry.register(registryKey, {
			signalAbort: () => {},
			handle,
			adapter: {
				stopSession: async () => ({
					outcome: "stopped" as const,
					tokenUsage: { byTier: {} },
				}),
				startSession: async () => handle,
				streamEvents: async function* () {},
				getCapabilities: () => ({
					preCompactionTrigger: false,
					subAgents: false,
					modelProviders: [],
					mcpSupport: false,
					returnEnforcement: "none" as const,
				}),
			},
			deliver: (text: string) =>
				adapter.deliver?.(handle, text) ?? Promise.resolve("unsupported" as const),
			agentId,
			threadId,
		});

		const result = await sessionRunRegistry.deliverToConversation(
			agentId,
			threadId,
			"hello deliver",
		);

		expect(result).toBe("delivered");

		// Assert the JSON line was written to stdin
		const allWritten = written.join("");
		expect(allWritten).toContain("hello deliver");
		// First write is the instruction; second is the deliver call
		const lines = allWritten.split("\n").filter(Boolean);
		const deliverLine = lines.find((l) => {
			try {
				const parsed = JSON.parse(l) as {
					type?: string;
					message?: { content?: Array<{ text?: string }> };
				};
				return parsed.message?.content?.some((c) => c.text === "hello deliver");
			} catch {
				return false;
			}
		});
		expect(deliverLine).toBeTruthy();

		sessionRunRegistry.deregister(registryKey);
	});
});
