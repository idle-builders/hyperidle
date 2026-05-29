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
 * These fail (red phase) until `isolated-harness-adapter.ts` is created.
 */

import { EventEmitter } from "node:events";
import type { HarnessAdapter } from "@hyperidle/shared";
import { describe, expect, it, vi } from "vitest";
import type { IsolationConfig } from "../../harness/isolated-harness-adapter.js";
import { IsolatedHarnessAdapter } from "../../harness/isolated-harness-adapter.js";
import type { CredentialResolver } from "../../services/credential-resolver.js";

// ── Mock CredentialResolver ────────────────────────────────────────────────

class FakeCredentialResolver implements CredentialResolver {
	async resolve(_name: string): Promise<string> {
		return "test-api-key";
	}
}

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

// ── Process isolation — env allowlist ────────────────────────────────────────

describe("IsolatedHarnessAdapter env allowlist", () => {
	it("passes only allowlisted env vars + API key to child process", async () => {
		// We need to spy on child_process.fork to verify the env argument
		const forkMock = vi.fn(() => {
			// Return a mock child process
			const child = new EventEmitter() as NodeJS.Process &
				EventEmitter & {
					pid: number;
					kill: (signal?: string) => boolean;
					send: (msg: object) => boolean;
				};
			child.pid = 12345;
			child.kill = vi.fn(() => true);
			child.send = vi.fn((msg: object) => {
				// Auto-emit started event when config is received
				if ((msg as { type: string }).type === "start") {
					setImmediate(() => {
						child.emit("message", {
							type: "session_result",
							result: {
								outcome: "completed",
								cost: { minor: 0, currency: "USD" },
								tokenUsage: { byTier: {} },
							},
						});
					});
				}
				return true;
			});
			return child;
		});

		const childProcessModule = await import("node:child_process");
		const forkSpy = vi.spyOn(childProcessModule, "fork").mockImplementation(forkMock as never);

		try {
			const resolver = new FakeCredentialResolver();
			const config: IsolationConfig = {
				maxMemoryMb: 512,
				maxDurationMs: 60000,
				envAllowlist: ["PATH", "HOME", "LANG"],
			};
			const adapter = new IsolatedHarnessAdapter(resolver, config);

			await adapter.startSession({
				workspacePath: "/workspace/test",
				soulPromptPath: "",
				modelTier: "workhorse",
				tools: [],
			});

			// Verify fork was called
			expect(forkSpy).toHaveBeenCalled();

			// Get the options passed to fork
			const forkCall = forkSpy.mock.calls[0];
			// forkCall[2] should be the options object with `env`
			const forkOptions = forkCall?.[2] as { env?: Record<string, string> } | undefined;
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
		} finally {
			forkSpy.mockRestore();
		}
	});
});

// ── Duration limit ────────────────────────────────────────────────────────────

describe("IsolatedHarnessAdapter duration limit", () => {
	it("kills child and returns crashed outcome when duration exceeded", async () => {
		vi.useFakeTimers();

		const killMock = vi.fn(() => true);
		const forkMock = vi.fn(() => {
			const child = new EventEmitter() as EventEmitter & {
				pid: number;
				kill: (signal?: string) => boolean;
				send: (msg: object) => boolean;
			};
			child.pid = 99999;
			child.kill = killMock;
			child.send = vi.fn(() => true);
			// Child never sends a result (simulates hang)
			return child;
		});

		const childProcessModule = await import("node:child_process");
		const forkSpy = vi.spyOn(childProcessModule, "fork").mockImplementation(forkMock as never);

		try {
			const resolver = new FakeCredentialResolver();
			const config: IsolationConfig = {
				maxMemoryMb: 512,
				maxDurationMs: 1000, // 1 second timeout
				envAllowlist: ["PATH"],
			};
			const adapter = new IsolatedHarnessAdapter(resolver, config);

			const handle = await adapter.startSession({
				workspacePath: "/workspace/test",
				soulPromptPath: "",
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
			expect(killMock).toHaveBeenCalled();
		} finally {
			forkSpy.mockRestore();
			vi.useRealTimers();
		}
	});
});

// ── Event streaming via IPC ──────────────────────────────────────────────────

describe("IsolatedHarnessAdapter event streaming", () => {
	it("yields HarnessEvents from IPC messages", async () => {
		let capturedChild:
			| (EventEmitter & { pid: number; kill: () => boolean; send: (m: object) => boolean })
			| null = null;

		const childProcessModule = await import("node:child_process");
		const forkSpy = vi.spyOn(childProcessModule, "fork").mockImplementation(() => {
			const child = new EventEmitter() as EventEmitter & {
				pid: number;
				kill: () => boolean;
				send: (m: object) => boolean;
			};
			child.pid = 11111;
			child.kill = vi.fn(() => true);
			child.send = vi.fn(() => true);
			capturedChild = child;
			return child as never;
		});

		try {
			const resolver = new FakeCredentialResolver();
			const config: IsolationConfig = {
				maxMemoryMb: 512,
				maxDurationMs: 60000,
				envAllowlist: ["PATH", "HOME", "LANG"],
			};
			const adapter = new IsolatedHarnessAdapter(resolver, config);

			const handle = await adapter.startSession({
				workspacePath: "/workspace/test",
				soulPromptPath: "",
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
		} finally {
			forkSpy.mockRestore();
		}
	});
});

// ── stopSession ──────────────────────────────────────────────────────────────

describe("IsolatedHarnessAdapter stopSession", () => {
	it("sends stop signal to child process and returns result", async () => {
		const childProcessModule = await import("node:child_process");
		const forkSpy = vi.spyOn(childProcessModule, "fork").mockImplementation((() => {
			const child = new EventEmitter() as EventEmitter & {
				pid: number;
				kill: (signal?: string) => boolean;
				send: (msg: object) => boolean;
			};
			child.pid = 22222;
			child.kill = vi.fn(() => true);
			child.send = vi.fn((msg: object) => {
				if ((msg as { type: string }).type === "stop") {
					// Simulate child responding to stop
					setImmediate(() => {
						child.emit("message", {
							type: "session_result",
							result: {
								outcome: "stopped",
								cost: { minor: 50, currency: "USD" },
								tokenUsage: { byTier: { workhorse: { prompt: 5, completion: 2 } } },
							},
						});
					});
				}
				return true;
			});
			return child;
		}) as never);

		try {
			const resolver = new FakeCredentialResolver();
			const config: IsolationConfig = {
				maxMemoryMb: 512,
				maxDurationMs: 60000,
				envAllowlist: ["PATH", "HOME", "LANG"],
			};
			const adapter = new IsolatedHarnessAdapter(resolver, config);

			const handle = await adapter.startSession({
				workspacePath: "/workspace/test",
				soulPromptPath: "",
				modelTier: "workhorse",
				tools: [],
			});

			const result = await adapter.stopSession(handle);
			expect(result.outcome).toBe("stopped");
		} finally {
			forkSpy.mockRestore();
		}
	});
});
