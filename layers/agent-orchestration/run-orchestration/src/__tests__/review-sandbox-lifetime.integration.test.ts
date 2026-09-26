/**
 * The filesystem belongs to the work, not to the session.
 *
 * A session that ends by calling `submit_review` is not finished — it is
 * waiting, and a human may take days. When the verdict comes the agent is
 * resumed IN THAT DIRECTORY. Destroying it at teardown does not merely lose the
 * agent's files: the resume spawns the harness with a working directory that no
 * longer exists, and it hangs instead of failing, so the human's answer reaches
 * nobody and nothing anywhere says why. That is exactly what a real run did.
 *
 * So: a session that asked keeps its directory; a session that ended any other
 * way destroys it as before; and the resumed session ADOPTS the original rather
 * than spawning a fresh one — both because the agent is coming back to its own
 * work, and so exactly one session owns the delete.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, describe } from "vitest";
import {
	buildRunningHarnessPorts,
	type FakeHarnessAdapter,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	type SessionLifecyclePorts,
} from "../__testing__/test-fixtures.js";
import { createProvisioner } from "../provisioner.js";
import { recordReviewSession } from "../review-sessions.js";

/** A harness whose turn calls exactly the tool named — through the MCP namespace, as production does. */
function buildFakeHarnessAdapter(
	toolName: string | undefined,
	resumed: { path?: string },
	onReturnAction: (toolName: string) => Promise<void>,
): FakeHarnessAdapter {
	return {
		startSession: async (config: { sessionId: string }) => ({ sessionId: config.sessionId }),
		resumeSession: async (_nativeId: string, _message: string, config: { sandboxPath: string }) => {
			resumed.path = config.sandboxPath;
			return { sessionId: "resumed" };
		},
		streamEvents: () => ({
			async *[Symbol.asyncIterator]() {
				if (toolName) {
					await onReturnAction(toolName);
					yield { type: "tool_call", toolName, args: {} };
				}
			},
		}),
		stopSession: async () => ({ outcome: "completed" as const, tokenUsage: { byTier: {} } }),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
		getNativeSessionId: () => "native-abc",
	} as unknown as FakeHarnessAdapter;
}

/**
 * @lore `bridgeCall` models the path PRODUCTION takes. With the MCP bridge
 * open, a tool call arrives through `openMcpBridge`'s `onToolCall` and never
 * appears in `streamEvents` at all. A version of this suite that only drove the
 * stream passed while every real run destroyed the sandbox anyway.
 */
function buildHarnessPorts(
	bridgeCall: string | undefined,
	onReturnAction: (toolName: string) => Promise<void>,
): SessionLifecyclePorts {
	return buildRunningHarnessPorts({
		createReturnGate: () => ({ observe: () => undefined, returned: true }),
		openMcpBridge: bridgeCall
			? async ({ onToolCall }) => {
					await onReturnAction(bridgeCall);
					onToolCall?.({ toolName: bridgeCall, args: {} });
					return { token: "tok", url: "http://127.0.0.1:0/mcp" };
				}
			: undefined,
		closeMcpBridge: bridgeCall ? async () => undefined : undefined,
	});
}

interface RunOutcome {
	/** Whether the directory is STILL THERE afterwards — the only thing that matters. */
	readonly survives: boolean;
	readonly destroyed: ReadonlyArray<string>;
	readonly adopted: ReadonlyArray<string>;
	readonly resumedIn: string | undefined;
}

async function runOnce(
	db: HyperIdleDb,
	agentId: string,
	sandboxPath: string,
	opts: {
		readonly toolName?: string;
		readonly bridgeToolName?: string;
		readonly resumeFrom?: string;
	},
): Promise<RunOutcome> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	const destroyed: string[] = [];
	const adopted: string[] = [];
	const resumed: { path?: string } = {};
	// What `submit_review` does for real: write the row that says this session
	// filed a review. Nothing else about a return action is durable.
	let sessionIdForLink: string | undefined;
	const onReturnAction = async (name: string): Promise<void> => {
		if (!(name.endsWith("submit_review") && sessionIdForLink)) return;
		await recordReviewSession(
			db,
			{ reviewMessageId: `review-${sessionIdForLink}`, sessionId: sessionIdForLink },
			new Date().toISOString(),
		);
	};

	const deps = {
		db,
		eventBus: new EventBus(),
		adapterPool: {
			select: () => ({
				id: "fake-adapter",
				adapter: buildFakeHarnessAdapter(opts.toolName, resumed, onReturnAction),
				meta: {
					name: "Fake",
					kind: "local",
					type: undefined,
					modelProviders: [],
					maxConcurrent: 5,
				},
			}),
			release: () => undefined,
			describeSelectFailure: () => "test pool selected nothing",
		},
		workspace: {
			spawn: async () => ({ sandboxId: "sbx-fresh", path: sandboxPath }),
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			adopt: async (p: string) => {
				adopted.push(p);
				return { sandboxId: "sbx-adopted", path: p };
			},
			destroy: async (handle: { path: string }) => {
				destroyed.push(handle.path);
			},
		},
	} as unknown as ProvisionSessionDeps;

	const params = {
		taskId: null,
		agentId,
		productId: "task-free",
		sandboxBasePath: sandboxPath,
		agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
		harnessDisabled: [],
		...(opts.resumeFrom
			? {
					resume: {
						sessionId: "sess-original",
						harnessSessionId: "native-abc",
						sandboxPath: opts.resumeFrom,
						decision: "approve" as const,
						threadId: "thread-1",
						agentId,
					},
				}
			: {}),
	} as unknown as ProvisionSessionParams;

	const provisioner = createProvisioner(buildHarnessPorts(opts.bridgeToolName, onReturnAction));
	const admitted = await provisioner.admit(deps, params);
	sessionIdForLink = admitted.sessionId;
	await provisioner.run(deps, params, admitted);
	// @lore Assert the DIRECTORY, not the `workspace.destroy` spy. The
	// delete that matters is the `fs.rm` in the terminal transition; the adapter's
	// destroy removes an already-removed tree. A version of this suite that
	// watched only the spy passed while every real run deleted the sandbox.
	const target = opts.resumeFrom ?? sandboxPath;
	return { survives: fs.existsSync(target), destroyed, adopted, resumedIn: resumed.path };
}

describe("a sandbox outlives the session that asked for a verdict", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function tempDir(): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-sandbox-life-"));
		dirs.push(dir);
		return dir;
	}

	test("a session that filed a review keeps its directory", async ({ db }) => {
		const sandboxPath = tempDir();
		const { survives } = await runOnce(db as HyperIdleDb, "agent-asked", sandboxPath, {
			toolName: "mcp__hyperidle__submit_review",
		});
		expect(
			survives,
			"the human has not answered yet; deleting now makes the resume hang in a directory that is gone",
		).toBe(true);
	});

	test("a session that ended any other way still destroys it", async ({ db }) => {
		const sandboxPath = tempDir();
		const { survives } = await runOnce(db as HyperIdleDb, "agent-sent", sandboxPath, {
			toolName: "mcp__hyperidle__send_message",
		});
		expect(survives).toBe(false);
	});

	test("a session that called nothing still destroys it", async ({ db }) => {
		const sandboxPath = tempDir();
		const { survives } = await runOnce(db as HyperIdleDb, "agent-quiet", sandboxPath, {});
		expect(survives).toBe(false);
	});

	test("a review filed through the MCP bridge keeps the directory too", async ({ db }) => {
		const sandboxPath = tempDir();
		const { survives } = await runOnce(db as HyperIdleDb, "agent-asked-bridge", sandboxPath, {
			bridgeToolName: "mcp__hyperidle__submit_review",
		});
		expect(
			survives,
			"production runs with the bridge open — a check that reads only the stream does nothing on a real run",
		).toBe(true);
	});

	test("through the bridge, another return action still destroys it", async ({ db }) => {
		const sandboxPath = tempDir();
		const { survives } = await runOnce(db as HyperIdleDb, "agent-sent-bridge", sandboxPath, {
			bridgeToolName: "mcp__hyperidle__send_message",
		});
		expect(survives).toBe(false);
	});

	test("a resume adopts the original directory and runs the harness there", async ({ db }) => {
		const fresh = tempDir();
		const original = tempDir();
		const { adopted, resumedIn, survives } = await runOnce(
			db as HyperIdleDb,
			"agent-resumed",
			fresh,
			{ resumeFrom: original },
		);
		expect(adopted, "a resumed agent comes back to its own work").toEqual([original]);
		expect(
			resumedIn,
			"cursor-agent finds its chat by an md5 of the cwd string; anywhere else runs with no context and says nothing",
		).toBe(original);
		// It returned without asking again, so this session owns the delete.
		expect(survives).toBe(false);
	});
});
