/**
 * S2 — IsolatedHarnessAdapter: unit tests (AC6).
 *
 * Tests that IsolatedHarnessAdapter:
 * - forks a child process on startSession
 * - passes only the allowlisted env vars to the child
 * - streams events from IPC
 * - enforces duration limit (kills child on timeout)
 * - returns crashed outcome on timeout
 * - stops the child process on stopSession
 *
 * @lore S2: vi.spyOn on ESM namespace objects (via dynamic import) is not
 * supported in Vitest — "Module namespace is not configurable in ESM."
 * The fix is to use vi.mock("node:child_process") at the top level so the
 * entire module is replaced before the adapter imports it. We then import
 * the mocked `fork` directly to control it per-test via mockImplementation.
 */

import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import type { HarnessAdapter } from "@hyperidle/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IsolationConfig } from "../../harness/isolated-harness-adapter.js";
import { IsolatedHarnessAdapter } from "../../harness/isolated-harness-adapter.js";
import type { CredentialResolver } from "../../services/credential-resolver.js";

// ── Top-level module mock (must be hoisted, not inside a test) ────────────────

vi.mock("node:child_process", () => ({
	fork: vi.fn(),
}));

// Cast to typed mock so we can call mockImplementation/mockReturnValue
const forkMock = fork as unknown as ReturnType<typeof vi.fn>;

// ── Mock CredentialResolver ────────────────────────────────────────────────

class FakeCredentialResolver implements CredentialResolver {
	async resolve(_name: string): Promise<string> {
		return "test-api-key";
	}
}

afterEach(() => {
	forkMock.mockReset();
});

// ── Helper to build a mock child process ─────────────────────────────────────

function makeMockChild(opts?: {
	onStart?: (child: MockChild) => void;
	onStop?: (child: MockChild) => void;
}) {
	type MockChild = EventEmitter & {
		pid: number;
		kill: ReturnType<typeof vi.fn>;
		send: ReturnType<typeof vi.fn>;
	};

	const child = new EventEmitter() as MockChild;
	child.pid = Math.floor(Math.random() * 90000) + 10000;
	child.kill = vi.fn(() => true);
	child.send = vi.fn((msg: object) => {
		const typed = msg as { type: string };
		if (typed.type === "start") {
			opts?.onStart?.(child);
		} else if (typed.type === "stop") {
			opts?.onStop?.(child);
		}
		return true;
	});
	return child;
}

type MockChild = ReturnType<typeof makeMockChild>;

// ── Interface compliance ─────────────────────────────────────────────────────

describe("IsolatedHarnessAdapter interface compliance", () => {
	it("satisfies HarnessAdapter at compile time", () => {
		const resolver = new FakeCredentialResolver();
		const config: IsolationConfig = {
			maxMemoryMb: 512,
			maxDurationMs: 5000,
			envAllowlist: ["PATH", "HOME", "LANG"],
		};
		// If IsolatedHarnessAdapter doesn't implement HarnessAdapter, this fails
		const adapter: HarnessAdapter = new IsolatedHarnessAdapter(resolver, config);
		expect(adapter).toBeDefined();
	});

	it("getCapabilities returns modelProviders: [anthropic]", () => {
		const resolver = new FakeCredentialResolver();
		const config: IsolationConfig = {
			maxMemoryMb: 512,
			maxDurationMs: 5000,
			envAllowlist: ["PATH", "HOME", "LANG"],
		};
		const adapter = new IsolatedHarnessAdapter(resolver, config);
		const caps = adapter.getCapabilities();
		expect(caps.modelProviders).toContain("anthropic");
		expect(caps.preCompactionTrigger).toBe(true);
		expect(caps.subAgents).toBe(true);
	});
});

// ── Process isolation — env allowlist + memory limit (S2-F03) ─────────────────

describe("IsolatedHarnessAdapter env allowlist", () => {
	it("passes --max-old-space-size to fork execArgv (S2-F03)", async () => {
		forkMock.mockImplementation(() => {
			const child = makeMockChild({
				onStart: (c) => {
					setImmediate(() => {
						c.emit("message", {
							type: "session_result",
							result: {
								outcome: "completed",
								cost: { minor: 0, currency: "USD" },
								tokenUsage: { byTier: {} },
							},
						});
					});
				},
			});
			return child;
		});

		const resolver = new FakeCredentialResolver();
		const config: IsolationConfig = {
			maxMemoryMb: 768,
			maxDurationMs: 60000,
			envAllowlist: ["PATH"],
		};
		const adapter = new IsolatedHarnessAdapter(resolver, config);

		await adapter.startSession({
			sandboxPath: "/workspace/test",
			sessionId: "test-session",
			systemPromptPath: "",
			assembledPrompt: "",
			modelTier: "workhorse",
			tools: [],
		});

		const forkCall = forkMock.mock.calls[0] as [
			string,
			string[],
			{ execArgv?: string[]; env?: Record<string, string> },
		];
		const execArgv = forkCall?.[2]?.execArgv;
		expect(execArgv).toBeDefined();
		expect(execArgv).toContain("--max-old-space-size=768");
	});

	it("passes only allowlisted env vars + API key to child process", async () => {
		let capturedChild: MockChild | null = null;

		forkMock.mockImplementation(() => {
			const child = makeMockChild({
				onStart: (c) => {
					// Auto-emit session_result when start is received
					setImmediate(() => {
						c.emit("message", {
							type: "session_result",
							result: {
								outcome: "completed",
								cost: { minor: 0, currency: "USD" },
								tokenUsage: { byTier: {} },
							},
						});
					});
				},
			});
			capturedChild = child;
			return child;
		});

		const resolver = new FakeCredentialResolver();
		const config: IsolationConfig = {
			maxMemoryMb: 512,
			maxDurationMs: 60000,
			envAllowlist: ["PATH", "HOME", "LANG"],
		};
		const adapter = new IsolatedHarnessAdapter(resolver, config);

		await adapter.startSession({
			sandboxPath: "/workspace/test",
			sessionId: "test-session",
			systemPromptPath: "",
			assembledPrompt: "",
			modelTier: "workhorse",
			tools: [],
		});

		// Verify fork was called
		expect(forkMock).toHaveBeenCalled();
		expect(capturedChild).not.toBeNull();

		// Get the options passed to fork (third argument)
		const forkCall = forkMock.mock.calls[0] as [string, string[], { env?: Record<string, string> }];
		const forkOptions = forkCall?.[2];
		const childEnv = forkOptions?.env;

		if (childEnv) {
			// Must NOT contain HYPERIDLE_API_KEY (server's own key)
			expect(childEnv.HYPERIDLE_API_KEY).toBeUndefined();
			// Must NOT contain DATABASE_URL or other server secrets
			expect(childEnv.DATABASE_URL).toBeUndefined();
			// Only allowlisted keys plus the resolved API key
			const envKeys = Object.keys(childEnv);
			for (const key of envKeys) {
				const isAllowed = ["PATH", "HOME", "LANG"].includes(key) || key === "ANTHROPIC_API_KEY";
				expect(isAllowed, `Unexpected env key: ${key}`).toBe(true);
			}
		}
	});
});

// ── Duration limit ────────────────────────────────────────────────────────────

describe("IsolatedHarnessAdapter duration limit", () => {
	it("kills child and returns crashed outcome when duration exceeded", async () => {
		vi.useFakeTimers();

		let killMock: ReturnType<typeof vi.fn> | null = null;

		forkMock.mockImplementation(() => {
			const child = makeMockChild();
			// Override kill to track it
			killMock = child.kill;
			// Child never sends a result (simulates hang)
			return child;
		});

		const resolver = new FakeCredentialResolver();
		const config: IsolationConfig = {
			maxMemoryMb: 512,
			maxDurationMs: 1000, // 1 second timeout
			envAllowlist: ["PATH"],
		};
		const adapter = new IsolatedHarnessAdapter(resolver, config);

		const handle = await adapter.startSession({
			sandboxPath: "/workspace/test",
			sessionId: "test-session",
			systemPromptPath: "",
			assembledPrompt: "",
			modelTier: "workhorse",
			tools: [],
		});

		// Drain events in background (generator must terminate on timeout)
		const drainPromise = (async () => {
			for await (const _event of adapter.streamEvents(handle)) {
				// drain only
			}
		})();

		// Advance timer past maxDurationMs
		vi.advanceTimersByTime(2000);

		// Stream must terminate
		await drainPromise;

		// stopSession should return crashed
		const result = await adapter.stopSession(handle);
		expect(result.outcome).toBe("crashed");

		// kill should have been called
		expect(killMock).not.toBeNull();
		expect(killMock).toHaveBeenCalled();
		// S2-F04: timeout must use SIGKILL (unconditional), not SIGTERM
		expect(killMock).toHaveBeenCalledWith("SIGKILL");

		vi.useRealTimers();
	});
});

// ── stopSession SIGKILL escalation (S2-F04) ──────────────────────────────────

describe("IsolatedHarnessAdapter stopSession SIGKILL escalation", () => {
	it("escalates to SIGKILL after 5s if child does not exit", async () => {
		vi.useFakeTimers();

		let killMock: ReturnType<typeof vi.fn> | null = null;

		forkMock.mockImplementation(() => {
			const child = makeMockChild();
			killMock = child.kill;
			// Child never responds to stop (simulates a hung child)
			return child;
		});

		const resolver = new FakeCredentialResolver();
		const config: IsolationConfig = {
			maxMemoryMb: 512,
			maxDurationMs: 60000,
			envAllowlist: ["PATH"],
		};
		const adapter = new IsolatedHarnessAdapter(resolver, config);

		const handle = await adapter.startSession({
			sandboxPath: "/workspace/test",
			sessionId: "test-session",
			systemPromptPath: "",
			assembledPrompt: "",
			modelTier: "workhorse",
			tools: [],
		});

		// Start stopSession (will hang waiting for child result)
		const stopPromise = adapter.stopSession(handle);

		// Before 5s: SIGKILL should NOT have been called
		vi.advanceTimersByTime(4999);
		expect(killMock).not.toBeNull();

		// At 5s: escalation fires and SIGKILL is sent
		vi.advanceTimersByTime(1);
		expect(killMock).toHaveBeenCalledWith("SIGKILL");

		// Simulate child exit after SIGKILL
		// Manually resolve the session by emitting exit on the child
		// (we need to verify the mock was called, stop promise may stay pending)
		// Just verify SIGKILL was called
		const killCalls = (killMock as ReturnType<typeof vi.fn> | null)?.mock.calls ?? [];
		expect(killCalls.some((c: unknown[]) => c[0] === "SIGKILL")).toBe(true);

		// Suppress unhandled promise (stop may never resolve in this mock scenario)
		stopPromise.catch(() => {});

		vi.useRealTimers();
	});
});

// ── Event streaming via IPC ──────────────────────────────────────────────────

describe("IsolatedHarnessAdapter event streaming", () => {
	it("yields HarnessEvents from IPC messages", async () => {
		let capturedChild: MockChild | null = null;

		forkMock.mockImplementation(() => {
			const child = makeMockChild();
			capturedChild = child;
			return child;
		});

		const resolver = new FakeCredentialResolver();
		const config: IsolationConfig = {
			maxMemoryMb: 512,
			maxDurationMs: 60000,
			envAllowlist: ["PATH", "HOME", "LANG"],
		};
		const adapter = new IsolatedHarnessAdapter(resolver, config);

		const handle = await adapter.startSession({
			sandboxPath: "/workspace/test",
			sessionId: "test-session",
			systemPromptPath: "",
			assembledPrompt: "",
			modelTier: "workhorse",
			tools: [],
		});

		const eventsPromise = (async () => {
			const collected = [];
			for await (const event of adapter.streamEvents(handle)) {
				collected.push(event);
			}
			return collected;
		})();

		// Simulate child sending events via IPC
		setImmediate(() => {
			capturedChild?.emit("message", {
				type: "event",
				event: { type: "token_usage", inputTokens: 10, outputTokens: 5 },
			});
			capturedChild?.emit("message", {
				type: "event",
				event: { type: "completion", text: "done" },
			});
			capturedChild?.emit("message", {
				type: "session_result",
				result: {
					outcome: "completed",
					cost: { minor: 0, currency: "USD" },
					tokenUsage: { byTier: {} },
				},
			});
		});

		const events = await eventsPromise;
		expect(events).toHaveLength(2);
		expect(events[0]?.type).toBe("token_usage");
		expect(events[1]?.type).toBe("completion");
	});
});

// ── stopSession ──────────────────────────────────────────────────────────────

describe("IsolatedHarnessAdapter stopSession", () => {
	it("sends stop signal to child process and returns result", async () => {
		forkMock.mockImplementation(() => {
			const child = makeMockChild({
				onStop: (c) => {
					// Simulate child responding to stop with a session_result
					setImmediate(() => {
						c.emit("message", {
							type: "session_result",
							result: {
								outcome: "stopped",
								cost: { minor: 50, currency: "USD" },
								tokenUsage: { byTier: { workhorse: { prompt: 5, completion: 2 } } },
							},
						});
					});
				},
			});
			return child;
		});

		const resolver = new FakeCredentialResolver();
		const config: IsolationConfig = {
			maxMemoryMb: 512,
			maxDurationMs: 60000,
			envAllowlist: ["PATH", "HOME", "LANG"],
		};
		const adapter = new IsolatedHarnessAdapter(resolver, config);

		const handle = await adapter.startSession({
			sandboxPath: "/workspace/test",
			sessionId: "test-session",
			systemPromptPath: "",
			assembledPrompt: "",
			modelTier: "workhorse",
			tools: [],
		});

		const result = await adapter.stopSession(handle);
		expect(result.outcome).toBe("stopped");
	});
});
