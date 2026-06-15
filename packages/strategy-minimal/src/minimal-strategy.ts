/**
 * AK2 — Minimal reference Strategy implementation.
 *
 * All three Strategy responsibilities are inert:
 *   1. assembleContext  — writes empty scaffold dirs + empty manifest, returns
 *                         { itemCount: 0, durationMs: 0 }. No knowledge files.
 *   2. beginLearningIngestion — returns a no-op IngestionHandle. No watching,
 *                               no writeback, no background work.
 *   3. Background knowledge work — absent. No bootstrap, no routines, no agents.
 *
 * This is the TEMPLATE a contributor copies to implement the Strategy Port.
 * It is a real, documented package (@hyperidle/strategy-minimal) — not a
 * test fixture. Contributors select it at boot via:
 *
 *   setActiveStrategy(minimalStrategy); // in server-factory.ts or equivalent
 *
 * The minimal Strategy also serves as the TDD harness for the Kernel: under
 * it, a session runs to completion with zero Fabric involvement, proving the
 * Kernel is independently exercisable.
 *
 * @lore AK2 §3: "Subtlety to verify during build": the harness/agent requires
 * the context/+knowledge/+work/+.fabric/ scaffold and a valid manifest.json to
 * exist even when empty. assembleContext ALWAYS creates them so a session runs
 * to completion (AC1). The empty manifest keeps any post-mortem reader happy
 * (e.g. crash diagnostics that read .fabric/manifest.json).
 *
 * @lore AK2 §3: isRoutine is informational — the minimal Strategy ignores it.
 * Both task and routine sessions get the same inert scaffold (no task/bet or
 * routine context is injected regardless).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import type {
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	IngestionHandle,
	IngestionRequest,
	Strategy,
} from "@hyperidle/shared";

/**
 * Create the scaffold directories the harness/agent expects inside a sandbox.
 * The Fabric's assembleContext always creates these; the minimal Strategy must
 * create the same set so session teardown and crash post-mortems remain valid.
 */
function ensureSandboxScaffold(sandboxPath: string): void {
	fs.mkdirSync(path.join(sandboxPath, "context"), { recursive: true });
	fs.mkdirSync(path.join(sandboxPath, "knowledge"), { recursive: true });
	fs.mkdirSync(path.join(sandboxPath, "work"), { recursive: true });
	fs.mkdirSync(path.join(sandboxPath, ".fabric"), { recursive: true });
}

/**
 * Write an empty-items manifest.json to .fabric/ so any reader of the
 * manifest (crash post-mortem, diagnostic tools) does not fail on a missing
 * file. Shape mirrors the Fabric's manifest: session_id + assembled_at +
 * items array (empty).
 */
function writeEmptyManifest(sandboxPath: string, sessionId: string): void {
	const manifestPath = path.join(sandboxPath, ".fabric", "manifest.json");
	const manifest = {
		session_id: sessionId,
		assembled_at: new Date().toISOString(),
		items: [] as unknown[],
	};
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

/**
 * The minimal reference Strategy. Implements Strategy<HyperIdleDb> with all
 * responsibilities inert.
 *
 * Copy this module as the starting point for a new Strategy implementation.
 */
export const minimalStrategy: Strategy<HyperIdleDb> = {
	/**
	 * Assemble context — inert. Creates empty scaffold dirs + empty manifest.
	 * Does NOT write any knowledge files or inject any context.
	 * Returns { itemCount: 0, durationMs: 0 }.
	 */
	async assembleContext(req: ContextAssemblyRequest<HyperIdleDb>): Promise<ContextAssemblyOutcome> {
		const start = Date.now();
		ensureSandboxScaffold(req.sandboxPath);
		writeEmptyManifest(req.sandboxPath, req.sessionId);
		const durationMs = Date.now() - start;
		return { itemCount: 0, durationMs };
	},

	/**
	 * Begin learning ingestion — inert. Returns a no-op IngestionHandle.
	 * dispose() is a no-op and guaranteed not to throw (crash-path resilience).
	 */
	beginLearningIngestion(_req: IngestionRequest<HyperIdleDb>): IngestionHandle {
		return {
			dispose(): void {
				// No-op. The minimal Strategy performs no file watching, no writeback,
				// and no knowledge persistence. dispose() is a no-op by design.
			},
		};
	},
};
