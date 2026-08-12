import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GRAPH_FILE, type Graph } from "./trace-build.js";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mcp server startup", () => {
	// The harnesses spawn the server at session start; the graph must warm
	// itself so an agent's first query never pays for a full build, and no
	// manual trace-build step may be needed in a fresh worktree.
	it("warms the graph without any client interaction", async () => {
		rmSync(GRAPH_FILE, { force: true });
		const child = spawn("node_modules/.bin/tsx", ["tools/trace/mcp-server.ts"], {
			cwd: process.cwd(),
			stdio: ["pipe", "pipe", "pipe"],
		});
		try {
			let stderr = "";
			child.stderr.on("data", (d) => {
				stderr += String(d);
			});
			const deadline = Date.now() + 30_000;
			while (!stderr.includes("MCP server ready")) {
				expect(Date.now(), `server never reported ready; stderr:\n${stderr}`).toBeLessThan(
					deadline,
				);
				await sleep(100);
			}
			const warmDeadline = Date.now() + 30_000;
			while (!existsSync(GRAPH_FILE)) {
				expect(
					Date.now(),
					"graph artifact never appeared without a tool call — no startup warmup",
				).toBeLessThan(warmDeadline);
				await sleep(250);
			}
			const onDisk = JSON.parse(readFileSync(GRAPH_FILE, "utf8")) as Graph;
			const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
			expect(onDisk.head).toBe(head);
		} finally {
			child.kill("SIGTERM");
		}
	}, 90_000);
});
