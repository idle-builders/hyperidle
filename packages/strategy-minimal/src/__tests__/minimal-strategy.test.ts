/**
 * AK2 — Minimal Strategy unit tests (RED phase).
 *
 * AC1: A task can be dispatched and run end-to-end under a minimal Strategy
 *      that performs no context assembly, relevance, or attention work.
 * AC4 (contributor template): The minimal Strategy is a real, documented
 *      reference implementation — not a test fixture. A contributor copies
 *      it to implement the port.
 *
 * These tests FAIL until packages/strategy-minimal/src/minimal-strategy.ts
 * is written (green phase, build task #3).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { minimalStrategy } from "../index.js";

describe("minimalStrategy", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ak2-minimal-test-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	// ── assembleContext ───────────────────────────────────────────────────────

	it("assembleContext returns { itemCount: 0, durationMs: 0 } (inert, no knowledge)", async () => {
		const result = await minimalStrategy.assembleContext({
			// NOTE: db is typed as HyperIdleDb but minimal never touches it —
			// pass a sentinel to confirm no db calls occur.
			db: null as never,
			sandboxPath,
			sessionId: "session-test-1",
			taskId: "task-test-1",
			agentId: "agent-test-1",
			agentRole: "builder",
			teamId: "team-test-1",
			isRoutine: false,
		});

		expect(result.itemCount).toBe(0);
		// durationMs is measurable elapsed time — only assert it's a non-negative number.
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
	});

	it("assembleContext creates the sandbox scaffold dirs (context/ knowledge/ work/ .fabric/)", async () => {
		await minimalStrategy.assembleContext({
			db: null as never,
			sandboxPath,
			sessionId: "session-scaffold-1",
			taskId: "task-scaffold-1",
			agentId: "agent-scaffold-1",
			agentRole: "builder",
			teamId: "team-scaffold-1",
			isRoutine: false,
		});

		// The harness/agent expects these directories to exist.
		expect(fs.existsSync(path.join(sandboxPath, "context"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "knowledge"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "work"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, ".fabric"))).toBe(true);
	});

	it("assembleContext writes an empty-items manifest.json (invariant: path always exists)", async () => {
		const sessionId = "session-manifest-1";

		await minimalStrategy.assembleContext({
			db: null as never,
			sandboxPath,
			sessionId,
			taskId: "task-manifest-1",
			agentId: "agent-manifest-1",
			agentRole: "builder",
			teamId: "team-manifest-1",
			isRoutine: false,
		});

		const manifestPath = path.join(sandboxPath, ".fabric", "manifest.json");
		expect(fs.existsSync(manifestPath)).toBe(true);

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
			session_id: string;
			items: unknown[];
		};
		// Must have session_id and an empty items array (no knowledge assembled).
		expect(manifest.session_id).toBe(sessionId);
		expect(Array.isArray(manifest.items)).toBe(true);
		expect(manifest.items).toHaveLength(0);
	});

	it("assembleContext does NOT write any files under knowledge/ (no knowledge injection)", async () => {
		await minimalStrategy.assembleContext({
			db: null as never,
			sandboxPath,
			sessionId: "session-no-knowledge-1",
			taskId: "task-no-knowledge-1",
			agentId: "agent-no-knowledge-1",
			agentRole: "builder",
			teamId: "team-no-knowledge-1",
			isRoutine: false,
		});

		const knowledgeDir = path.join(sandboxPath, "knowledge");
		// Directory exists (scaffold) but is empty — no knowledge files written.
		const entries = fs.readdirSync(knowledgeDir);
		expect(entries).toHaveLength(0);
	});

	it("assembleContext works identically for routine sessions (isRoutine: true)", async () => {
		const result = await minimalStrategy.assembleContext({
			db: null as never,
			sandboxPath,
			sessionId: "session-routine-1",
			taskId: "task-routine-1",
			agentId: "agent-routine-1",
			agentRole: "builder",
			teamId: "team-routine-1",
			isRoutine: true,
		});

		expect(result.itemCount).toBe(0);
	});

	// ── beginLearningIngestion ────────────────────────────────────────────────

	it("beginLearningIngestion returns an IngestionHandle with a dispose() no-op", () => {
		const handle = minimalStrategy.beginLearningIngestion({
			db: null as never,
			sandboxPath,
			sessionId: "session-ingest-1",
			manifestPath: path.join(sandboxPath, ".fabric", "manifest.json"),
		});

		expect(typeof handle.dispose).toBe("function");
		// dispose() must not throw (best-effort contract per Strategy Port spec).
		expect(() => handle.dispose()).not.toThrow();
	});

	it("dispose() is idempotent — calling it twice does not throw", () => {
		const handle = minimalStrategy.beginLearningIngestion({
			db: null as never,
			sandboxPath,
			sessionId: "session-ingest-idempotent-1",
			manifestPath: path.join(sandboxPath, ".fabric", "manifest.json"),
		});

		expect(() => {
			handle.dispose();
			handle.dispose();
		}).not.toThrow();
	});

	it("dispose() does not throw even if sandboxPath is gone (crash-path resilience)", () => {
		const handle = minimalStrategy.beginLearningIngestion({
			db: null as never,
			sandboxPath: "/tmp/ak2-nonexistent-sandbox-xyz",
			sessionId: "session-crash-1",
			manifestPath: "/tmp/ak2-nonexistent-sandbox-xyz/.fabric/manifest.json",
		});

		expect(() => handle.dispose()).not.toThrow();
	});
});
