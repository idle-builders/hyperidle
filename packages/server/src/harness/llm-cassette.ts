/**
 * AH6 B2 — LLM Cassette: record/replay at the callLlm choke point.
 *
 * RED STUB — This file provides the correct type exports so TypeScript is happy,
 * but every function throws "not implemented" so unit tests FAIL correctly.
 * The green phase (B2) replaces this with the real implementation.
 *
 * Exports:
 *   - CassetteMissError — thrown when replay mode encounters a missing cassette key
 *   - buildCassetteKey — returns SHA-256 hex of canonical-JSON request hash
 *   - replayLlm — returns a recorded LlmResponse from in-memory entries
 *   - recordLlm — makes a real callLlm call and records the response
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

import type { CallLlmOptions } from "./llm-client.js";
import type { LlmResponse } from "./llm-types.js";

// ---------------------------------------------------------------------------
// CassetteEntry — the shape stored in cassette JSON files
// ---------------------------------------------------------------------------

export interface CassetteEntry {
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
 * Thrown by replayLlm when the cassette file has no entry for the request key.
 * Fail-closed: a missing cassette must FAIL the lane, never silently fall through
 * to a network call.
 */
export class CassetteMissError extends Error {
	public readonly missingKey: string;
	public readonly cassettePath: string;

	constructor(missingKey: string, cassettePath: string) {
		super(
			`Cassette miss: no recorded response for key ${missingKey.slice(0, 8)}… ` +
				`in ${cassettePath}. Re-record with LLM_CASSETTE_MODE=record.`,
		);
		this.name = "CassetteMissError";
		this.missingKey = missingKey;
		this.cassettePath = cassettePath;
	}
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
 *
 * RED STUB: throws until B2 implements the real hash.
 */
export function buildCassetteKey(_options: CallLlmOptions): string {
	throw new Error(
		"AH6 RED STUB: buildCassetteKey not implemented. Implement llm-cassette.ts in the green phase (B2).",
	);
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
 *
 * RED STUB: throws until B2 implements the real replay logic.
 */
export async function replayLlm(
	_options: CallLlmOptions,
	_entries: CassetteEntry[],
): Promise<LlmResponse> {
	throw new Error(
		"AH6 RED STUB: replayLlm not implemented. Implement llm-cassette.ts in the green phase (B2).",
	);
}

// ---------------------------------------------------------------------------
// recordLlm — make a real call and persist the response
// ---------------------------------------------------------------------------

/**
 * Make a real LLM call via callLlmDirect and record the response.
 *
 * Appends/overwrites the cassette entry keyed by the request hash.
 * Flushed to LLM_CASSETTE_DIR/LLM_CASSETTE_SCENARIO.json on process exit.
 *
 * RED STUB: throws until B2 implements the real record logic.
 */
export async function recordLlm(
	_options: CallLlmOptions,
	_callLlmDirect: (options: CallLlmOptions) => Promise<LlmResponse>,
): Promise<LlmResponse> {
	throw new Error(
		"AH6 RED STUB: recordLlm not implemented. Implement llm-cassette.ts in the green phase (B2).",
	);
}
