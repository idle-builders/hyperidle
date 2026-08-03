/**
 * AH6 B2 — LLM Cassette: record/replay at the callLlm choke point.
 *
 * Exports:
 *   - CassetteMissError — thrown when replay mode encounters a missing cassette key
 *   - buildCassetteKey — returns SHA-256 hex of canonical-JSON request hash
 *   - replayLlm — returns a recorded LlmResponse from in-memory entries
 *   - recordLlm — makes a real callLlmDirect call and records the response
 *   - CassetteEntry — the entry shape stored in cassette JSON files
 *
 * @lore AH6: The interception point is AT the callLlm definition module
 * (not in the adapter). The env-gated dispatcher in llm-client.ts imports
 * replayLlm/recordLlm from here. Production (no LLM_CASSETTE_MODE env var)
 * never imports this module's runtime functions.
 *
 * @lore AH6 WARNING-1: replayLlm must await LLM_REPLAY_DELAY_MS (default 80ms)
 * before returning so the ThinkingRow is paintable in the S3 scenario.
 *
 * @lore AH6 WARNING-3: The cassette dir comes from LLM_CASSETTE_DIR env (set by
 * the Playwright config). The server never uses a hardcoded relative path into
 * the web package.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { CassetteMissError } from "@hyperidle/shared";
import type { CallLlmOptions } from "./llm-client.js";
import type {
	LlmContentBlock,
	LlmMessage,
	LlmResponse,
	LlmTextBlock,
	LlmToolDef,
	LlmToolResultBlock,
	LlmToolUseBlock,
} from "./llm-types.js";

// ---------------------------------------------------------------------------
// CassetteEntry — the shape stored in cassette JSON files
// ---------------------------------------------------------------------------

interface CassetteEntry {
	/** SHA-256 hex key derived from the canonical request hash */
	readonly key: string;
	/** The original request (stored for human review in the cassette file) */
	readonly request: CallLlmOptions;
	/** The recorded LlmResponse to replay */
	readonly response: LlmResponse;
}

// ---------------------------------------------------------------------------
// CassetteMissError — thrown when replay can't find a cassette key
// ---------------------------------------------------------------------------

/**
 * `CassetteMissError` moved to `@hyperidle/shared` (AU19 Increment 3h) —
 * `dispatch`'s `mapErrorToNotice` needs `instanceof CassetteMissError`
 * across the agent-orchestration → agent-execution seam, and Mechanism C
 * forbids a Service importing another Service's class. Re-exported here
 * unchanged so this file's own `throw new CassetteMissError(...)` call site
 * needs no edit.
 */
export { CassetteMissError };

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TOKENS = 16_384;
const DEFAULT_REPLAY_DELAY_MS = 80;

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Strip :nitro and other routing suffixes from model id */
function stripRoutingSuffix(modelId: string): string {
	// Strip trailing :suffix (e.g. :nitro, :route, :extended)
	return modelId.replace(/:[^:]+$/, "");
}

/** ISO-8601 timestamp regex */
const ISO_TS_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;

/** Unix ms epoch — 13-digit numbers that look like timestamps */
const MS_EPOCH_RE = /\b1[5-9]\d{11}\b/g;

/** Agent id pattern — ast-<uuid> */
const AGENT_ID_RE = /\bast-[0-9a-f-]{8,}\b/gi;

/** UUID pattern */
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function normalizeText(text: string): string {
	return text
		.replace(ISO_TS_RE, "__ts__")
		.replace(MS_EPOCH_RE, "__ts__")
		.replace(AGENT_ID_RE, "__agent__")
		.replace(UUID_RE, "__uuid__");
}

/**
 * Normalize message content for stable cassette keying.
 * - tool_use id → positional token __tooluse_<n>__
 * - tool_result toolUseId → positional token (parallel to tool_use)
 * - timestamps, agent ids, uuids in text → normalized
 */
function normalizeMessages(messages: readonly LlmMessage[]): unknown[] {
	// First pass: collect all tool_use ids in order across all messages
	const toolUseIds: string[] = [];
	for (const msg of messages) {
		if (typeof msg.content !== "string") {
			for (const block of msg.content) {
				if (block.type === "tool_use") {
					toolUseIds.push(block.id);
				}
			}
		}
	}

	const idToToken = new Map<string, string>();
	for (let i = 0; i < toolUseIds.length; i++) {
		const id = toolUseIds[i];
		if (id !== undefined) {
			idToToken.set(id, `__tooluse_${i}__`);
		}
	}

	return messages.map((msg) => {
		if (typeof msg.content === "string") {
			return { role: msg.role, content: normalizeText(msg.content) };
		}

		const normalizedContent = msg.content.map((block: LlmContentBlock) => {
			if (block.type === "text") {
				const tb = block as LlmTextBlock;
				return { type: "text", text: normalizeText(tb.text) };
			}
			if (block.type === "tool_use") {
				const tu = block as LlmToolUseBlock;
				return {
					type: "tool_use",
					id: idToToken.get(tu.id) ?? `__tooluse_unknown__`,
					name: tu.name,
					input: tu.input,
				};
			}
			if (block.type === "tool_result") {
				const tr = block as LlmToolResultBlock;
				return {
					type: "tool_result",
					toolUseId: idToToken.get(tr.toolUseId) ?? `__tooluse_unknown__`,
					content: normalizeText(tr.content),
					isError: tr.isError,
				};
			}
			return block;
		});

		return { role: msg.role, content: normalizedContent };
	});
}

function normalizeTools(tools: readonly LlmToolDef[] | undefined): unknown[] {
	if (!tools || tools.length === 0) return [];
	return [...tools]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((t) => ({ name: t.name, inputSchema: t.inputSchema }));
}

// ---------------------------------------------------------------------------
// buildCassetteKey — deterministic prompt hash
// ---------------------------------------------------------------------------

/**
 * Compute the cassette key for a given set of CallLlmOptions.
 *
 * Key = SHA-256 hex of the canonical JSON of:
 *   { model, system, messages, tools, maxTokens }
 * where:
 *   - model = options.model.model with :nitro/:route suffix stripped
 *   - apiKey, baseUrl, provider excluded (offline/no-key invariant)
 *   - tool_use ids + tool_result toolUseIds replaced by positional tokens
 *   - ISO-8601 timestamps in text content → __ts__
 *   - ast-<uuid> agent ids in text → __agent__
 *   - crypto.randomUUID() echoes in text → __uuid__
 *   - tool array is sorted by name (order-independent)
 */
function buildCassetteKey(options: CallLlmOptions): string {
	// @lore AH6: The system prompt is normalized (UUIDs, timestamps, agent IDs replaced)
	// so cassette keys are stable even when the system prompt includes runtime-generated
	// values like currentDraftBetId (e.g. "[CONTEXT: You previously drafted bet <uuid>...]").
	// Without this normalization, S3's key would be non-deterministic across runs.
	const hashInput = {
		model: stripRoutingSuffix(options.model.model),
		system: normalizeText(options.system ?? ""),
		messages: normalizeMessages(options.messages),
		tools: normalizeTools(options.tools),
		maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
	};

	const json = JSON.stringify(hashInput);
	return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// replayLlm — return a recorded response from in-memory entries
// ---------------------------------------------------------------------------

/**
 * Replay a recorded LlmResponse from the provided cassette entries.
 *
 * - Computes the key from options (same normalizer as buildCassetteKey).
 * - Looks up the entry by key; throws CassetteMissError if absent (fail-closed).
 * - Awaits LLM_REPLAY_DELAY_MS (default 80ms) before returning (WARNING-1).
 * - Makes NO network call.
 *
 * The entries parameter is provided directly for unit tests (in-memory seam).
 * Production (via the dispatcher in llm-client.ts) passes entries loaded from
 * the cassette file at LLM_CASSETTE_DIR/LLM_CASSETTE_SCENARIO.json.
 */
async function replayLlm(options: CallLlmOptions, entries: CassetteEntry[]): Promise<LlmResponse> {
	const key = buildCassetteKey(options);

	// Determine the cassette path for error reporting
	const cassetteDir = process.env.LLM_CASSETTE_DIR ?? "<unknown>";
	const scenario = process.env.LLM_CASSETTE_SCENARIO ?? "unknown";
	const cassettePath = `${cassetteDir}/${scenario}.json`;

	const entry = entries.find((e) => e.key === key);
	if (!entry) {
		throw new CassetteMissError(key, cassettePath);
	}

	// WARNING-1: Await the replay delay so the ThinkingRow is paintable
	const delayMs = Number(process.env.LLM_REPLAY_DELAY_MS ?? DEFAULT_REPLAY_DELAY_MS);
	const effectiveDelay =
		Number.isFinite(delayMs) && delayMs > 0 ? delayMs : DEFAULT_REPLAY_DELAY_MS;
	await new Promise<void>((resolve) => setTimeout(resolve, effectiveDelay));

	return entry.response;
}

// ---------------------------------------------------------------------------
// Cassette file loading
// ---------------------------------------------------------------------------

/**
 * Load cassette entries from the file at LLM_CASSETTE_DIR/LLM_CASSETTE_SCENARIO.json.
 * Fails closed if LLM_CASSETTE_DIR is missing.
 */
function loadCassetteEntries(): CassetteEntry[] {
	const cassetteDir = process.env.LLM_CASSETTE_DIR;
	if (!cassetteDir) {
		throw new Error(
			"[AH6] LLM_CASSETTE_MODE is set but LLM_CASSETTE_DIR is missing. " +
				"Set LLM_CASSETTE_DIR to the cassette directory path.",
		);
	}
	const scenario = process.env.LLM_CASSETTE_SCENARIO ?? "default";
	const cassettePath = path.join(cassetteDir, `${scenario}.json`);

	if (!fs.existsSync(cassettePath)) {
		// Return empty array; replayLlm will throw CassetteMissError on first call
		return [];
	}

	try {
		const raw = fs.readFileSync(cassettePath, "utf-8");
		return JSON.parse(raw) as CassetteEntry[];
	} catch (err) {
		throw new Error(
			`[AH6] Failed to parse cassette file ${cassettePath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

// ---------------------------------------------------------------------------
// recordLlm — make a real call and persist the response
// ---------------------------------------------------------------------------

/**
 * In-memory accumulator for recorded entries.
 * Entries are written to disk eagerly after each recordLlm call (CRITICAL-4)
 * and also at process exit/SIGTERM as a belt-and-suspenders fallback.
 *
 * @lore AH6: Using a module-level Map means multiple calls within one process
 * accumulate correctly. Each write merges in-memory entries with the on-disk file.
 */
const recordedEntries = new Map<string, CassetteEntry>();

/**
 * Token-usage accumulator for the record run.
 *
 * @lore AU21 (harness-telemetry narrowing): This used to also accumulate an
 * ESTIMATED $-cost (via a hardcoded per-model rate table in the now-deleted
 * llm-cost-estimate.ts) and fail-close on a dollar cap. Founder ruling: keep
 * only token usage — "very few harness can actually report cost". The
 * fail-closed CI-safety guard now gates on accumulated TOKENS instead of an
 * estimated dollar figure (same intent — bound real spend during a local
 * paid-API smoke run — using the one signal every harness genuinely reports).
 * On flush, writes ah6-cost.json to AH6_COST_REPORT_PATH so ah6-assert-budget.ts
 * can read it — filename/env var kept for back-compat; payload no longer
 * carries a $ figure.
 */
interface RecordRunUsage {
	totalInputTokens: number;
	totalOutputTokens: number;
	model: string;
}

const recordRunUsage: RecordRunUsage = {
	totalInputTokens: 0,
	totalOutputTokens: 0,
	model: "",
};

let recordFlushScheduled = false;

/**
 * Write current cassette entries and cost report to disk synchronously.
 *
 * @lore AH6 CRITICAL-4: Called EAGERLY after each recordLlm call (not just at
 * process exit). Playwright kills the webServer with SIGKILL after tests finish,
 * and exit handlers do not run on SIGKILL. Eager writes guarantee the cassette
 * and cost files are on disk before the process is killed.
 * The exit/SIGTERM/SIGINT handlers remain as a belt-and-suspenders fallback.
 */
function flushRecordToDisk(): void {
	const cassetteDir = process.env.LLM_CASSETTE_DIR;
	if (!cassetteDir || recordedEntries.size === 0) return;

	const scenario = process.env.LLM_CASSETTE_SCENARIO ?? "default";
	const cassettePath = path.join(cassetteDir, `${scenario}.json`);

	try {
		// Load existing entries to merge/overwrite
		let existing: CassetteEntry[] = [];
		if (fs.existsSync(cassettePath)) {
			try {
				existing = JSON.parse(fs.readFileSync(cassettePath, "utf-8")) as CassetteEntry[];
			} catch {
				existing = [];
			}
		}

		// Merge: recorded entries overwrite by key
		const merged = new Map<string, CassetteEntry>();
		for (const entry of existing) {
			merged.set(entry.key, entry);
		}
		for (const [k, entry] of recordedEntries) {
			merged.set(k, entry);
		}

		fs.mkdirSync(cassetteDir, { recursive: true });
		fs.writeFileSync(cassettePath, JSON.stringify(Array.from(merged.values()), null, 2), "utf-8");
		process.stdout.write(`[AH6] Cassette written: ${cassettePath} (${merged.size} entries)\n`);
	} catch (err) {
		process.stderr.write(
			`[AH6] Failed to write cassette ${cassettePath}: ${err instanceof Error ? err.message : String(err)}\n`,
		);
	}

	// CRITICAL-2: Write ah6-cost.json so ah6-assert-budget.ts can read it.
	// Path/filename kept as "cost" for back-compat (AH6_COST_REPORT_PATH is wired
	// through playwright.ah6.config.ts + the smoke orchestrator) but the payload
	// no longer carries a $ figure — @lore AU21 (harness-telemetry narrowing):
	// gate on token usage, the one signal every harness genuinely reports.
	const costReportPath = process.env.AH6_COST_REPORT_PATH;
	const totalTokens = recordRunUsage.totalInputTokens + recordRunUsage.totalOutputTokens;
	if (costReportPath && totalTokens > 0) {
		try {
			const usageReport = {
				totalTokens,
				model: recordRunUsage.model,
				timestamp: new Date().toISOString(),
			};
			const costDir = path.dirname(costReportPath);
			fs.mkdirSync(costDir, { recursive: true });
			fs.writeFileSync(costReportPath, JSON.stringify(usageReport, null, 2), "utf-8");
			process.stdout.write(
				`[AH6] Usage report written: ${costReportPath} (${totalTokens} tokens, model=${recordRunUsage.model})\n`,
			);
		} catch (err) {
			process.stderr.write(
				`[AH6] Failed to write usage report ${costReportPath}: ${err instanceof Error ? err.message : String(err)}\n`,
			);
		}
	}
}

function scheduleRecordFlush(): void {
	if (recordFlushScheduled) return;
	recordFlushScheduled = true;

	// Register SIGTERM/SIGINT/exit handlers as belt-and-suspenders fallback.
	// Primary writes happen eagerly via flushRecordToDisk() after each recordLlm call.
	process.once("exit", flushRecordToDisk);
	process.once("SIGTERM", () => {
		flushRecordToDisk();
		process.exit(0);
	});
	process.once("SIGINT", () => {
		flushRecordToDisk();
		process.exit(0);
	});
}

/**
 * Make a real LLM call via callLlmDirect and record the response.
 *
 * Appends/overwrites the cassette entry keyed by the request hash.
 * Flushed to LLM_CASSETTE_DIR/LLM_CASSETTE_SCENARIO.json on process exit.
 *
 * CRITICAL-2: Also accumulates token usage from response.usage. Fails closed if
 * cumulative tokens exceed AH6_MAX_TOKENS (@lore AU21 harness-telemetry
 * narrowing: was a $-cost estimate/cap; founder ruling narrowed this to token
 * usage only — "very few harness can actually report cost"). Writes
 * ah6-cost.json on flush via AH6_COST_REPORT_PATH (filename kept for
 * back-compat; payload no longer carries a $ figure).
 *
 * @lore AH6 CRITICAL-2: S-1 security note — apiKey is redacted in the stored
 * request (set to "__redacted__"). Only model.model + model.provider are stored.
 * No key leaks in the cassette file. The normalizers (timestamps, agent ids, uuids)
 * run only for KEYING (buildCassetteKey), NOT for the stored request — the stored
 * request preserves real content for human review of the cassette diff.
 */
async function recordLlm(
	options: CallLlmOptions,
	callLlmDirect: (options: CallLlmOptions) => Promise<LlmResponse>,
): Promise<LlmResponse> {
	const key = buildCassetteKey(options);
	const response = await callLlmDirect(options);

	// Store the request without sensitive fields.
	// S-1: apiKey redacted to "__redacted__" — never stored in cassette files.
	// baseUrl also redacted — unnecessary for human review and may encode auth info.
	// Only model.model + model.provider are meaningful in the stored request.
	const safeRequest: CallLlmOptions = {
		...options,
		model: {
			...options.model,
			apiKey: "__redacted__",
			baseUrl: "__redacted__",
		},
	};

	const entry: CassetteEntry = { key, request: safeRequest, response };
	recordedEntries.set(key, entry);

	// CRITICAL-2: Accumulate token usage. Strip routing suffix for a clean model label.
	const modelId = stripRoutingSuffix(options.model.model);
	recordRunUsage.totalInputTokens += response.usage.inputTokens;
	recordRunUsage.totalOutputTokens += response.usage.outputTokens;
	if (!recordRunUsage.model) {
		recordRunUsage.model = modelId;
	}

	// Fail-closed on cap: abort the process if cumulative tokens exceed the cap.
	// This prevents a runaway turn from overrunning the budget before the post-lane
	// assert step runs. @lore AU21 harness-telemetry narrowing: was a $-cost cap;
	// AH6_MAX_TOKENS already existed as an established sibling threshold (surfaced
	// in scripts/ah6-smoke-local.ts) — reusing it here, not inventing a new one.
	const maxTokens = Number(process.env.AH6_MAX_TOKENS ?? "20000");
	const currentTokens = recordRunUsage.totalInputTokens + recordRunUsage.totalOutputTokens;
	if (currentTokens > maxTokens) {
		// Write cassette eagerly before aborting so partial progress is captured
		flushRecordToDisk();
		process.stderr.write(
			`[AH6] ABORT: Budget cap exceeded mid-run: ${currentTokens} tokens > cap ${maxTokens} tokens. ` +
				`Increase AH6_MAX_TOKENS or optimize the smoke prompt.\n`,
		);
		process.exit(1);
	}

	// CRITICAL-4: Write eagerly after each call — Playwright kills the server with
	// SIGKILL after tests finish, so process exit handlers do not reliably run.
	// The exit/SIGTERM handlers registered by scheduleRecordFlush are belt-and-suspenders.
	flushRecordToDisk();
	scheduleRecordFlush();

	return response;
}

// ---------------------------------------------------------------------------
// Test-only helpers — exported for unit tests, not used in production.
// ---------------------------------------------------------------------------

/**
 * @testonly Reset the in-memory usage accumulator between tests.
 * Not used in production — only imported by llm-cassette.test.ts.
 */
function resetUsageAccumulator(): void {
	recordRunUsage.totalInputTokens = 0;
	recordRunUsage.totalOutputTokens = 0;
	recordRunUsage.model = "";
	recordedEntries.clear();
	recordFlushScheduled = false;
}

/**
 * @testonly Read the current in-memory usage accumulator.
 * Not used in production — only imported by llm-cassette.test.ts.
 */
function readUsageAccumulator(): Readonly<RecordRunUsage> {
	return { ...recordRunUsage };
}

export type { CassetteEntry };
export {
	buildCassetteKey,
	loadCassetteEntries,
	readUsageAccumulator,
	recordLlm,
	replayLlm,
	resetUsageAccumulator,
};
