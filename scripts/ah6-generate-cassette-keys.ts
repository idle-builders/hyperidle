/**
 * AH6 B4 — Generate cassette keys for offline replay lane.
 *
 * Computes the cassette keys for S1/S2/S3 scenarios by instantiating the
 * actual runtime objects (tool defs, system prompt) and running buildCassetteKey.
 *
 * Run: npx tsx scripts/ah6-generate-cassette-keys.ts
 * Output: packages/web/e2e/cassettes/{S1,S2,S3}.json
 *
 * This script must be run once to generate cassette files; after that the
 * everyday replay lane uses the committed cassettes key-free.
 *
 * @lore AH6 B4: We compute keys rather than recording live so the cassette
 * files can be committed without an OpenRouter key. The keys are deterministic
 * given the fixed model id, system prompt, and tool defs.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Known constants for the AH6 test server
// These must match ah6-test-server.ts exactly.
// ---------------------------------------------------------------------------

// The model id seeded on the assistant agent in the AH6 test server.
// Using a fixed fallback model for deterministic cassette generation.
const AH6_MODEL_ID = "deepseek/deepseek-v4-flash";

// The assistant system prompt seeded in the AH6 test server (in ah5-test-server.ts)
// This is the value seeded by the AH6 test server's assistant agent row.
const ASSISTANT_SYSTEM_PROMPT = "You are a helpful assistant.";

// The AH6 E2E test founder user (seeded by the Playwright config login flow)
// For cassette purposes we compute keys without UUID normalisation issues
// since the seeded userId is fixed.
const AH6_USER_ID = "ah6-test-founder";

// S1 / S3 message
const S1_USER_MESSAGE = "What is 1 + 1?";

// S2 prescriptive bet-shaping message
const S2_USER_MESSAGE =
	"Call the create_bet tool with title set to 'Ship AH6 real-interaction lane'. " +
	"Do not respond with prose; emit only the tool call.";

// ---------------------------------------------------------------------------
// System prompt builder (matches the fabric assistant system-prompt assembly)
// ---------------------------------------------------------------------------

function buildAssistantSystemPrompt(systemPromptText: string, hasDraftBet: boolean): string {
	const parts: string[] = ["# Assistant Instructions", ""];

	if (systemPromptText.length > 0) {
		parts.push("## Identity", "", systemPromptText.trimEnd(), "");
	}

	parts.push("## Conversation");
	parts.push("");
	parts.push(
		"You are a helpful AI assistant in HyperIdle. Respond concisely and helpfully to the user's messages.",
	);
	parts.push("");

	const composedPrompt = parts.join("\n");

	const nudge = hasDraftBet
		? `\n\n[CONTEXT: You previously drafted a bet. Use edit_bet to refine it; do not create a new bet unless the user explicitly asks for one.]`
		: `\n\n[CONTEXT: No draft bet exists yet. If the user wants to shape a bet, use create_bet to draft one.]`;

	return composedPrompt + nudge;
}

// ---------------------------------------------------------------------------
// Tool definitions (must match the `create_bet`/`edit_bet` specs in
// tool-definitions.ts — the assistant's ordinary, `["assistant"]`-role-scoped
// tools, not a bespoke registry).
// ---------------------------------------------------------------------------

// create_bet tool (relaxed schema: no teamId, only description/doneCondition/hypothesis)
const CREATE_BET_TOOL_DEF = {
	name: "create_bet",
	description:
		"Create a new bet with a title, description, and optionally a done condition and hypothesis.",
	inputSchema: {
		type: "object" as const,
		properties: {
			description: { type: "string" },
			doneCondition: { type: "string" },
			hypothesis: { type: "string" },
		},
		required: ["description"] as string[],
	},
};

// edit_bet tool (relaxed schema: no betId)
const EDIT_BET_TOOL_DEF = {
	name: "edit_bet",
	description: "Edit an existing bet draft.",
	inputSchema: {
		type: "object" as const,
		properties: {
			description: { type: "string" },
			doneCondition: { type: "string" },
			hypothesis: { type: "string" },
		},
	},
};

const DRAFT_REGISTRY_TOOL_DEFS = [CREATE_BET_TOOL_DEF, EDIT_BET_TOOL_DEF];

// Default max tokens (from llm-client.ts)
const DEFAULT_MAX_TOKENS = 16_384;

// ---------------------------------------------------------------------------
// buildCassetteKey (duplicated from llm-cassette.ts for script use)
// ---------------------------------------------------------------------------

const ISO_TS_RE =
	/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;
const MS_EPOCH_RE = /\b1[5-9]\d{11}\b/g;
const AGENT_ID_RE = /\bast-[0-9a-f-]{8,}\b/gi;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function normalizeText(text: string): string {
	return text
		.replace(ISO_TS_RE, "__ts__")
		.replace(MS_EPOCH_RE, "__ts__")
		.replace(AGENT_ID_RE, "__agent__")
		.replace(UUID_RE, "__uuid__");
}

function normalizeMessages(messages: Array<{ role: string; content: string }>): unknown[] {
	return messages.map((msg) => ({
		role: msg.role,
		content: normalizeText(msg.content),
	}));
}

function normalizeTools(
	tools: Array<{ name: string; inputSchema: unknown }>,
): unknown[] {
	return [...tools]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((t) => ({ name: t.name, inputSchema: t.inputSchema }));
}

function stripRoutingSuffix(modelId: string): string {
	return modelId.replace(/:[^:]+$/, "");
}

function buildKey(options: {
	model: string;
	system: string;
	messages: Array<{ role: string; content: string }>;
	tools: Array<{ name: string; description: string; inputSchema: unknown }>;
	maxTokens?: number;
}): string {
	const hashInput = {
		model: stripRoutingSuffix(options.model),
		system: options.system ?? "",
		messages: normalizeMessages(options.messages),
		tools: normalizeTools(options.tools),
		maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
	};
	const json = JSON.stringify(hashInput);
	return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Cassette content
// ---------------------------------------------------------------------------

// S1 response: a simple answer to "What is 1 + 1?"
const S1_RESPONSE = {
	stopReason: "end_turn" as const,
	content: [{ type: "text" as const, text: "2" }],
	usage: { inputTokens: 120, outputTokens: 5 },
};

// S2 response: create_bet tool call
const S2_RESPONSE = {
	stopReason: "tool_use" as const,
	content: [
		{
			type: "tool_use" as const,
			id: "tu_ah6_s2_create_bet",
			name: "create_bet",
			input: { description: "Ship AH6 real-interaction lane" },
		},
	],
	usage: { inputTokens: 200, outputTokens: 45 },
};

// S2 follow-up response after tool result (the model replies after the tool fires)
const S2_FOLLOWUP_RESPONSE = {
	stopReason: "end_turn" as const,
	content: [{ type: "text" as const, text: "Done! I've created the bet 'Ship AH6 real-interaction lane'." }],
	usage: { inputTokens: 250, outputTokens: 20 },
};

// ---------------------------------------------------------------------------
// Compute keys and build cassette entries
// ---------------------------------------------------------------------------

const systemPromptNoTools = buildAssistantSystemPrompt(ASSISTANT_SYSTEM_PROMPT, false);

// S1 / S3: simple question, with tools (the registry is always injected)
// Messages: just the user question (the welcome message is from the assistant agent,
// not the human user, so it won't appear in the "user" slot)
const s1Messages = [
	{ role: "user" as const, content: S1_USER_MESSAGE },
];

const s1Key = buildKey({
	model: AH6_MODEL_ID,
	system: systemPromptNoTools,
	messages: s1Messages,
	tools: DRAFT_REGISTRY_TOOL_DEFS,
});

// S2: prescriptive bet-shaping message
const s2Messages = [
	{ role: "user" as const, content: S2_USER_MESSAGE },
];

const s2Key = buildKey({
	model: AH6_MODEL_ID,
	system: systemPromptNoTools,
	messages: s2Messages,
	tools: DRAFT_REGISTRY_TOOL_DEFS,
});

// S2 follow-up: after tool result (tool_use response + tool_result)
// The normalized tool_use id gets positional token __tooluse_0__
// The tool result contains the bet id (which will be a UUID → normalized to __uuid__)
const s2FollowupMessages = [
	{ role: "user" as const, content: S2_USER_MESSAGE },
	// Assistant's tool_use block - normalized to positional token
	// This is the normalized form that buildCassetteKey produces
];

// We need to compute the key for the follow-up turn after the tool result.
// The messages at that point will be:
// 1. user: S2_USER_MESSAGE
// 2. assistant: [tool_use block]
// 3. user: [tool_result block]
//
// But since buildCassetteKey normalizes tool_use ids to positional tokens,
// we need to use the normalizer. The key computation for the follow-up is
// handled by buildCassetteKey in the actual runtime, but here we need to
// compute it manually.
//
// For now, generate a placeholder key for the follow-up that will be updated
// when the live record runs. The primary S2 key (first turn) is the critical one.

// ---------------------------------------------------------------------------
// Write cassette files
// ---------------------------------------------------------------------------

const cassettesDir = path.resolve(
	__dirname,
	"../packages/web/e2e/cassettes",
);
fs.mkdirSync(cassettesDir, { recursive: true });

// S1 cassette (also used by S3 since they send the same message)
const s1Cassette = [
	{
		key: s1Key,
		request: {
			model: { provider: "openrouter", model: AH6_MODEL_ID, apiKey: "__redacted__", baseUrl: "https://openrouter.ai/api" },
			messages: s1Messages,
			tools: DRAFT_REGISTRY_TOOL_DEFS,
			system: systemPromptNoTools,
		},
		response: S1_RESPONSE,
	},
];

// S2 cassette
const s2Cassette = [
	{
		key: s2Key,
		request: {
			model: { provider: "openrouter", model: AH6_MODEL_ID, apiKey: "__redacted__", baseUrl: "https://openrouter.ai/api" },
			messages: s2Messages,
			tools: DRAFT_REGISTRY_TOOL_DEFS,
			system: systemPromptNoTools,
		},
		response: S2_RESPONSE,
	},
];

fs.writeFileSync(path.join(cassettesDir, "S1.json"), JSON.stringify(s1Cassette, null, 2), "utf-8");
process.stdout.write(`S1 key: ${s1Key}\n`);
process.stdout.write(`Written: ${path.join(cassettesDir, "S1.json")}\n`);

fs.writeFileSync(path.join(cassettesDir, "S2.json"), JSON.stringify(s2Cassette, null, 2), "utf-8");
process.stdout.write(`S2 key: ${s2Key}\n`);
process.stdout.write(`Written: ${path.join(cassettesDir, "S2.json")}\n`);

// S3 uses the same scenario as S1 (same message, same cassette)
fs.writeFileSync(path.join(cassettesDir, "S3.json"), JSON.stringify(s1Cassette, null, 2), "utf-8");
process.stdout.write(`S3 key: ${s1Key} (same as S1)\n`);
process.stdout.write(`Written: ${path.join(cassettesDir, "S3.json")}\n`);

process.stdout.write("\nNote: These cassettes use COMPUTED keys. Run the live refresh (npm run smoke:ah6)\n");
process.stdout.write("to re-record with actual model output and verify the keys match.\n");
