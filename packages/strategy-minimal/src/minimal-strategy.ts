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
	AgentScaffoldSpec,
	AssistantFormation,
	AssistantFormationRequest,
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	DecomposeBetRequest,
	DecompositionPlan,
	IngestionHandle,
	IngestionRequest,
	ScaffoldRequest,
	SelectAgentOutcome,
	SelectAgentRequest,
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

	/**
	 * AK6: Decide which agents a creation trigger produces under the Minimal Strategy.
	 *
	 * Minimal = no injected knowledge (systemPrompt: null on every spec).
	 * One plain agent per team; individual Assistant for user; passthrough for agent_added.
	 *
	 * @lore AK6: The Minimal Strategy is the TDD harness for the Kernel: it produces
	 * the smallest valid set of agents so the Kernel path is independently exercisable
	 * without Fabric involvement (AC3). systemPrompt is always null here — "empty
	 * AGENTS.md" per the concept closure contract.
	 */
	async scaffoldAgents(req: ScaffoldRequest<HyperIdleDb>): Promise<readonly AgentScaffoldSpec[]> {
		switch (req.trigger) {
			case "team_scaffold":
				return [
					{
						role: "builder",
						name: `${req.teamName ?? "Agent"} Agent`,
						agentCategory: "team",
						systemPrompt: null,
					},
				];
			case "agent_added": {
				if (req.role === null) {
					throw new Error("agent_added trigger requires a role");
				}
				// Pass caller-supplied name through; synthesize only when null.
				const name = req.name ?? `${req.teamName ?? "Agent"} ${req.role}`;
				return [
					{
						role: req.role,
						name,
						agentCategory: "team",
						systemPrompt: null,
					},
				];
			}
			case "user_assistant":
				return [
					{
						role: "assistant",
						name: req.ownerUserName ? `${req.ownerUserName}'s Assistant` : "Assistant",
						agentCategory: "individual",
						systemPrompt: null,
						idHint: req.ownerUserId ? `ast-${req.ownerUserId}` : undefined,
					},
				];
		}
	},

	/**
	 * AK7: Decide which agent owns a unit of work under the Minimal Strategy.
	 *
	 * Minimal = no knowledge, no skill match. For bet_* surfaces: honor roleHint
	 * if a candidate matches; else first candidate; else null. For routine_delegate:
	 * candidates is always [] and Minimal has no delegation knowledge → null.
	 *
	 * @lore AK7: Satisfies the seam trivially (AK2 hard rule). A one-agent team
	 * always returns that agent. routine_delegate falls through to null because
	 * candidates is [] for that surface — the Fabric handles real delegation.
	 */
	async selectAgent(req: SelectAgentRequest<HyperIdleDb>): Promise<SelectAgentOutcome> {
		const byRole = req.roleHint ? req.candidates.find((c) => c.role === req.roleHint) : undefined;
		const chosen = byRole ?? req.candidates[0];
		return { agentId: chosen?.agentId ?? null };
	},

	/**
	 * AK8: Decide who decomposes and what the breakdown is under the Minimal Strategy.
	 *
	 * AK3 fallback: role-match PM else first candidate. tasks:[] → Kernel runs its
	 * existing PM turn — byte-identical to AK3-as-built (§4 Minimal fallback).
	 * NO knowledge task list in Minimal — that is the Fabric's future concern.
	 *
	 * @lore AK8: tasks:[] from Minimal means "Kernel, run your PM turn" (turn-source
	 * precedence branch 2 or 3). This preserves AK3 behaviour exactly: the same PM is
	 * chosen, the same turn runs, the same tasks are produced.
	 */
	async decomposeBet(req: DecomposeBetRequest<HyperIdleDb>): Promise<DecompositionPlan> {
		// AK3 fallback: role-match PM else first candidate; NO knowledge task list.
		const pm = req.candidates.find((c) => c.role === "product_manager") ?? req.candidates[0];
		return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
	},

	/**
	 * AR4b: Provide the assistant's formation at turn time.
	 *
	 * Minimal = no injected knowledge, no persona override.
	 * - persona: null — "use the agent row's systemPrompt as-is".
	 * - assistantDraftSurface: "standard" — the canonical 2-tool surface (create_bet +
	 *   edit_bet), built by buildAssistantDraftRegistry in the Kernel.
	 *
	 * @lore AR4b: persona:null is the Minimal default, mirroring systemPrompt:null on
	 * AgentScaffoldSpec for team agents — "no formation knowledge, use Kernel defaults."
	 * The Fabric strategy returns a non-null persona shaped from the team/user context.
	 */
	async formAssistant(_req: AssistantFormationRequest<HyperIdleDb>): Promise<AssistantFormation> {
		return { persona: null, assistantDraftSurface: "standard" };
	},
};
