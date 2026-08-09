/**
 * AL7 WARNING-A — commit_file sandbox containment check.
 *
 * An absolute path or `../` traversal outside the session sandboxPath must be
 * REJECTED (OUTSIDE_SANDBOX error). ETHOS §4 trusts the agent — this is bookkeeping
 * hygiene, not a security guard — but the proof-vehicle tool should not perform
 * unbounded arbitrary host-file writes.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildToolDefinitions } from "@hyperidle/agent-orchestration";
import type { CoreApiTransport } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ToolContext } from "@hyperidle/shared";
import { afterAll, describe, expect, it } from "vitest";

/**
 * @lore AU31 §3.2/B2: `commit_file` never reaches `ports.coreApi.*` (it only
 * touches the sandbox filesystem) — the factory still needs A transport
 * value to build the full tool list, but this one is provably never
 * invoked, so a transport that throws if called is more honest than wiring
 * a real `app` this tool never touches.
 */
const neverCalledTransport: CoreApiTransport = () => {
	throw new Error("commit_file does not reach the CoreApiPort seam");
};

const commitFileTool = buildToolDefinitions(neverCalledTransport).find(
	(t) => t.name === "commit_file",
)!;

// Minimal stub of ToolContext — commit_file only uses sandboxPath
function makeCtx(sandboxPath: string): ToolContext<HyperIdleDb> {
	return {
		// biome-ignore lint/suspicious/noExplicitAny: minimal stub for unit test
		db: {} as any,
		// biome-ignore lint/suspicious/noExplicitAny: minimal stub for unit test
		eventBus: {} as any,
		agentId: "test-agent",
		sessionId: "test-session",
		taskId: "test-task",
		sandboxPath,
		ingestion: { dispose: (): void => {} },
	};
}

// Create a temp sandbox dir for each test
const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "hi-al7-sandbox-"));
const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "hi-al7-outside-"));

afterAll(() => {
	try {
		fs.rmSync(sandboxDir, { recursive: true, force: true });
		fs.rmSync(outsideDir, { recursive: true, force: true });
	} catch {
		// Non-fatal cleanup
	}
});

describe("AL7 WARNING-A: commit_file sandbox containment", () => {
	it("writes a relative path inside the sandbox — success", async () => {
		const ctx = makeCtx(sandboxDir);
		const result = await commitFileTool.handler({ path: "output.txt", content: "hello" }, ctx);
		expect(result.success).toBe(true);
		expect(fs.existsSync(path.join(sandboxDir, "output.txt"))).toBe(true);
	});

	it("writes an absolute path inside the sandbox — success", async () => {
		const ctx = makeCtx(sandboxDir);
		const absPath = path.join(sandboxDir, "sub", "nested.txt");
		const result = await commitFileTool.handler({ path: absPath, content: "nested" }, ctx);
		expect(result.success).toBe(true);
		expect(fs.existsSync(absPath)).toBe(true);
	});

	it("rejects a relative `../` path that escapes the sandbox", async () => {
		const ctx = makeCtx(sandboxDir);
		// ../escape.txt would resolve to the parent of sandboxDir — outside the sandbox
		const result = await commitFileTool.handler({ path: "../escape.txt", content: "bad" }, ctx);
		expect(result.success).toBe(false);
		const errResult = result as { success: false; code: string };
		expect(errResult.code).toBe("OUTSIDE_SANDBOX");
		// The file must NOT have been written outside the sandbox
		expect(fs.existsSync(path.resolve(sandboxDir, "../escape.txt"))).toBe(false);
	});

	it("rejects an absolute path outside the sandbox", async () => {
		const ctx = makeCtx(sandboxDir);
		const outsidePath = path.join(outsideDir, "exfil.txt");
		const result = await commitFileTool.handler({ path: outsidePath, content: "bad" }, ctx);
		expect(result.success).toBe(false);
		const errResult = result as { success: false; code: string };
		expect(errResult.code).toBe("OUTSIDE_SANDBOX");
		expect(fs.existsSync(outsidePath)).toBe(false);
	});

	it("rejects a path with deep traversal (../../..)", async () => {
		const ctx = makeCtx(sandboxDir);
		const result = await commitFileTool.handler(
			{ path: "../../../../../../tmp/exfil.txt", content: "bad" },
			ctx,
		);
		expect(result.success).toBe(false);
		const errResult = result as { success: false; code: string };
		expect(errResult.code).toBe("OUTSIDE_SANDBOX");
	});
});
