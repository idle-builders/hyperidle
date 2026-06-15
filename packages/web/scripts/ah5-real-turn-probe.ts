/**
 * AH5: Real-turn server probe — drives provisionSession (production seam).
 *
 * This probe is the AH5-own gating proof: it runs a REAL OpenRouter turn
 * through the production path (provisionSession → runSession →
 * BuiltinHarnessAdapter → callLlm) with NO mocks on the credential, LLM,
 * or harness path.
 *
 * Asserts:
 *   1. result.outcome === "completed"
 *   2. totalCostCents > 0 (real LLM call was made)
 *   3. totalCostCents <= AH5_MAX_COST_CENTS (budget cap)
 *   4. A `write_session_notes` tool_call event was emitted with notes === "AH5-SMOKE-OK"
 *
 * Writes ah5-cost.json to playwright-report-ah5/ for the CI budget-assert step.
 *
 * @lore AH5: This probe drives provisionSession DIRECTLY (no HTTP, no Hono).
 * It mirrors how packages/eval/src/provision-harness.ts runs eval scenarios.
 * We chose direct provisionSession over going through the HTTP route to avoid
 * auth middleware setup while still exercising the SAME production code path
 * that the HTTP route calls.
 *
 * @lore AH5: The prescriptive prompt explicitly names the tool:
 * "Call the write_session_notes tool with notes set to 'AH5-SMOKE-OK'.
 *  Do not respond with prose; emit only the tool call."
 * Determinism comes from the prescriptive prompt, not model intelligence.
 *
 * @lore AH5: Cost is read from result.totalCostCents (the already-aggregated
 * total from provisionSession/runSession). We do NOT re-derive cost from
 * cost_update events or export estimateCostUsd (module-private).
 *
 * @lore AH5: The probe runs with a real PGlite DB + seeded data (same approach
 * as eval harness). It does NOT connect to the test-server's DB — it has its
 * own isolated PGlite instance. The test-server is for the Playwright UI proof;
 * the probe is the API-level gating proof.
 *
 * @lore AH5: If RESOLVE_MODEL_FILE is set, the probe reads the selected model
 * from there. Otherwise it uses AH5_FALLBACK_MODEL_ID or a static default.
 *
 * @lore AH5 W4: The probe resolves the model via resolveModelTier("workhorse", ...)
 * (the global tier path), NOT via resolveAgentModel (the per-agent AH2 path).
 * The agent row IS seeded with modelProvider/modelId, but provisionSession
 * consumes the pre-resolved model — it never reads the per-agent model from
 * the users row. The real seam exercised here is: modelGateway.workhorse config
 * → resolveModelTier → DbCredentialResolver → callLlm. The per-agent seam
 * (resolveAgentModel) is AH3's responsibility, not the probe's. The agent row's
 * model columns are seeded for completeness but are not the live seam.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
	bets,
	type HyperIdleDb,
	schema,
	serverCredentials,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { AdapterPool } from "@hyperidle/server/harness/adapter-pool";
import { BuiltinHarnessAdapter } from "@hyperidle/server/harness/builtin-harness-adapter";
import { LocalSandboxAdapter } from "@hyperidle/server/harness/local-sandbox-adapter";
import {
	encryptCredentialValue,
	getServerSecret,
} from "@hyperidle/server/services/credential-encryption";
import { DbCredentialResolver } from "@hyperidle/server/services/credential-resolver";
import { resolveModelTier } from "@hyperidle/server/services/model-gateway";
import { readServerConfig, updateServerConfig } from "@hyperidle/server/services/server-config";
import { provisionSession } from "@hyperidle/server/services/session-provisioning";
import type { ResolvedModel } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_COST_CENTS = Number(process.env.AH5_MAX_COST_CENTS ?? "5");
// @lore AH5 W2: Cost report lives in packages/web/playwright-report-ah5/ so the
// CI artifact upload (path: packages/web/playwright-report-ah5/) and the
// budget-assert script (COST_FILE resolved from packages/web/scripts/) both
// point to the same file. Using packages/playwright-report-ah5/ (one dir up)
// caused a silent mismatch — the upload step never found the file.
const COST_REPORT_PATH = path.resolve(scriptDir, "../playwright-report-ah5/ah5-cost.json");

// Env guards
const HYPERIDLE_API_KEY = "ah5-probe-api-key";
const HYPERIDLE_CREDENTIAL_KEY = "ah5-probe-cred-key-32chars!!!!";
process.env.HYPERIDLE_API_KEY = HYPERIDLE_API_KEY;
process.env.HYPERIDLE_CREDENTIAL_KEY = HYPERIDLE_CREDENTIAL_KEY;
process.env.HYPERIDLE_PROFILE = "laptop";

const openrouterApiKey = process.env.OPENROUTER_API_KEY;
if (!openrouterApiKey) {
	process.stderr.write("[ah5-probe] FATAL: OPENROUTER_API_KEY is not set.\n");
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Resolve smoke model
// ---------------------------------------------------------------------------

let smokeModelId =
	process.env.AH5_FALLBACK_MODEL_ID ?? "google/gemini-2.5-flash-preview-05-20:nitro";
const resolveModelFile = process.env.RESOLVE_MODEL_FILE;
if (resolveModelFile && fs.existsSync(resolveModelFile)) {
	try {
		const parsed = JSON.parse(fs.readFileSync(resolveModelFile, "utf-8")) as { routedId?: string };
		if (parsed.routedId) smokeModelId = parsed.routedId;
	} catch {
		/* fallback */
	}
}
process.stdout.write(`[ah5-probe] Using model: ${smokeModelId}\n`);

// ---------------------------------------------------------------------------
// Boot PGlite
// ---------------------------------------------------------------------------

const migrationsFolder = path.resolve(scriptDir, "../../db/drizzle");
const client = new PGlite();
await client.waitReady;
const rawDb = drizzle(client, { schema });
await migrate(rawDb, { migrationsFolder });
const db = rawDb as unknown as HyperIdleDb;

// ---------------------------------------------------------------------------
// Seed encrypted OpenRouter credential into DB
// ---------------------------------------------------------------------------

const serverSecret = getServerSecret();
if (!serverSecret) {
	process.stderr.write("[ah5-probe] FATAL: No server secret configured.\n");
	process.exit(1);
}
const encryptedKey = encryptCredentialValue(openrouterApiKey, serverSecret);
const now = new Date().toISOString();
await db.insert(serverCredentials).values({
	name: "openrouter_api_key",
	encryptedValue: encryptedKey,
	validationState: "present_untested",
	updatedAt: now,
});

// ---------------------------------------------------------------------------
// Configure server: set model gateway to openrouter for workhorse tier
// ---------------------------------------------------------------------------

const cfg = await readServerConfig(db);
await updateServerConfig(db, {
	modelGateway: {
		...cfg.modelGateway,
		workhorse: {
			provider: "openrouter",
			model: smokeModelId,
		},
	},
});

// ---------------------------------------------------------------------------
// Seed minimal DB: team + teamMembers + agent + bet + task
// ---------------------------------------------------------------------------

const teamId = randomUUID();
const teamMembersId = randomUUID();
const agentId = randomUUID();
const betId = randomUUID();
const taskId = randomUUID();

await db
	.insert(teams)
	.values({ id: teamId, name: "AH5 Probe Team", phase: "alpha", createdAt: now });
await db
	.insert(teamMembers)
	.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: now });
await db.insert(users).values({
	id: agentId,
	kind: "ai",
	name: "AH5 Probe Agent",
	role: "builder",
	status: "active",
	teamId: teamMembersId, // @lore U1: references team_members.id
	soulPrompt: "You are a helpful assistant that follows precise instructions.",
	harnessType: "builtin",
	modelProvider: "openrouter",
	modelId: smokeModelId,
	createdAt: now,
});
await db.insert(bets).values({
	id: betId,
	teamId,
	description: "AH5 smoke lane probe bet",
	appetite: "small",
	status: "active",
	costAppetiteMinor: 1000,
	costAppetiteCurrency: "USD",
	createdAt: now,
});
await db.insert(tasks).values({
	id: taskId,
	betId,
	teamId,
	title: "AH5 Smoke Probe Task",
	state: "accepted",
	createdAt: now,
	updatedAt: now,
});

// ---------------------------------------------------------------------------
// Set up adapter pool + workspace
// ---------------------------------------------------------------------------

const pool = new AdapterPool();
// maxIterations: 3 for the probe — prescriptive prompt should complete in 1 turn
const builtinAdapter = new BuiltinHarnessAdapter({ maxIterations: 3 });
pool.register("ah5-probe-builtin", builtinAdapter, {
	name: "AH5 Probe Builtin",
	kind: "local",
	type: "builtin",
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	maxConcurrent: 1,
});

const workspace = new LocalSandboxAdapter();
const eventBus = new EventBus();

// ---------------------------------------------------------------------------
// Resolve the model through production DbCredentialResolver
// ---------------------------------------------------------------------------

const credentialResolver = new DbCredentialResolver(db, serverSecret);
const updatedCfg = await readServerConfig(db);
const resolvedModel: ResolvedModel | undefined = await resolveModelTier(
	"workhorse",
	updatedCfg.modelGateway,
	credentialResolver,
);
if (!resolvedModel) {
	process.stderr.write(
		"[ah5-probe] FATAL: resolveModelTier returned undefined. Credential not set?\n",
	);
	process.exit(1);
}
process.stdout.write(
	`[ah5-probe] Resolved model: provider=${resolvedModel.provider}, model=${resolvedModel.model}\n`,
);

// ---------------------------------------------------------------------------
// Track tool_call events
// ---------------------------------------------------------------------------

interface ToolCallRecordedEvent {
	type: "tool_call_recorded";
	toolName: string;
	argsSummary: string;
	sessionId: string;
	streamId: string;
	timestamp: number;
}

const toolCallEvents: ToolCallRecordedEvent[] = [];
eventBus.on("tool_call_recorded", (event) => {
	toolCallEvents.push(event as ToolCallRecordedEvent);
});

// ---------------------------------------------------------------------------
// Run the real turn
// ---------------------------------------------------------------------------

process.stdout.write("[ah5-probe] Running provisionSession (real LLM call)...\n");
const startMs = Date.now();

const result = await provisionSession(
	{ db, eventBus, adapterPool: pool, workspace },
	{
		taskId,
		agentId,
		productId: teamId,
		sandboxBasePath: "/tmp/ah5-probe-workspaces",
		resolvedModel,
	},
);

const durationMs = Date.now() - startMs;
process.stdout.write(
	`[ah5-probe] Done. outcome=${result.outcome}, totalCostCents=${result.totalCostCents}, durationMs=${durationMs}\n`,
);

// ---------------------------------------------------------------------------
// Write cost report (fail-closed: always write before any assertions)
// ---------------------------------------------------------------------------

const reportDir = path.dirname(COST_REPORT_PATH);
if (!fs.existsSync(reportDir)) {
	fs.mkdirSync(reportDir, { recursive: true });
}

const costReport = {
	totalCostCents: result.totalCostCents,
	model: smokeModelId,
	outcome: result.outcome,
	durationMs,
	toolCallEvents: toolCallEvents.map((e) => ({ toolName: e.toolName, argsSummary: e.argsSummary })),
	timestamp: new Date().toISOString(),
};
fs.writeFileSync(COST_REPORT_PATH, JSON.stringify(costReport, null, 2), "utf-8");
process.stdout.write(`[ah5-probe] Cost report written to ${COST_REPORT_PATH}\n`);

// ---------------------------------------------------------------------------
// Assertions (liveness checks)
// ---------------------------------------------------------------------------

let failed = false;

if (result.outcome !== "completed") {
	process.stderr.write(`[ah5-probe] FAIL: outcome=${result.outcome} (expected "completed")\n`);
	failed = true;
}

if (result.totalCostCents <= 0) {
	process.stderr.write(
		`[ah5-probe] FAIL: totalCostCents=${result.totalCostCents} (expected > 0 for a real LLM turn)\n`,
	);
	failed = true;
}

if (result.totalCostCents > MAX_COST_CENTS) {
	process.stderr.write(
		`[ah5-probe] FAIL: totalCostCents=${result.totalCostCents} > cap ${MAX_COST_CENTS}\n`,
	);
	failed = true;
}

// ---------------------------------------------------------------------------
// Assert: write_session_notes tool call with correct notes (AC3 — always run)
//
// @lore AH5: This assertion is NOT gated behind AH3. The probe drives
// provisionSession DIRECTLY — it does NOT depend on the UI message→turn trigger
// that AH3 provides. The tool-call assertion is always-run and gating.
//
// The ONLY thing that remains test.fixme()-gated (in the Playwright spec) is
// the UI-trigger assertion: sending a message through the AssistantOverlay and
// watching the tool-call summary row render. That path requires AH3.
//
// This probe's path: provisionSession → runSession → BuiltinHarnessAdapter →
// callLlm (real OpenRouter call) → tool_call_recorded event.
// This path is fully live today, AH3-independent.
//
// If the model emits prose instead of the tool call, that is a model-quality
// signal the lane must surface, not suppress. The prescriptive prompt
// ("Call the write_session_notes tool with notes set to 'AH5-SMOKE-OK'.
//  Do not respond with prose; emit only the tool call.") is designed to make
// the tool call deterministic. If it is not deterministic for a given model,
// that model should not pass the lane — fail closed.
// ---------------------------------------------------------------------------

process.stdout.write(`[ah5-probe] Tool calls observed: ${toolCallEvents.length}\n`);
for (const evt of toolCallEvents) {
	process.stdout.write(`[ah5-probe]   tool_call: ${evt.toolName}\n`);
}

const writeNotesEvent = toolCallEvents.find((e) => e.toolName === "write_session_notes");

if (!writeNotesEvent) {
	process.stderr.write(
		"[ah5-probe] FAIL: No 'write_session_notes' tool_call_recorded event observed.\n" +
			"  AC3 requires ≥1 real tool-using action via the prescriptive prompt.\n" +
			"  The prescriptive prompt explicitly instructs the model to call write_session_notes.\n" +
			"  If the model emitted prose instead, this is a model-quality signal — fail closed.\n",
	);
	failed = true;
} else {
	// Verify the notes argument via argsSummary (JSON-stringified tool args).
	// argsSummary is produced by summarizeToolArgs which JSON.stringify(args).
	// Expected: '{"notes":"AH5-SMOKE-OK"}'
	let notes: string | undefined;
	try {
		const parsed = JSON.parse(writeNotesEvent.argsSummary) as Record<string, unknown>;
		notes = parsed["notes"] as string | undefined;
	} catch {
		// argsSummary not valid JSON — treat as missing notes
	}
	if (notes !== "AH5-SMOKE-OK") {
		process.stderr.write(
			`[ah5-probe] FAIL: write_session_notes called but notes="${String(notes)}" !== "AH5-SMOKE-OK".\n` +
				`  argsSummary: ${writeNotesEvent.argsSummary}\n` +
				"  The prescriptive prompt requires notes to be exactly 'AH5-SMOKE-OK'.\n",
		);
		failed = true;
	} else {
		process.stdout.write(
			`[ah5-probe] write_session_notes tool call observed with notes="${notes}". AC3 PASS.\n`,
		);
	}
}

await client.close();

if (failed) {
	process.exit(1);
}

process.stdout.write("[ah5-probe] PASS: Real turn completed successfully.\n");
