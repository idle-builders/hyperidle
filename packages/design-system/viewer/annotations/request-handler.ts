/**
 * AJ5 — request-handler.ts
 *
 * Pure adapter — no Vite imports, no Node http, no side effects beyond calling
 * the annotation store. Testable in isolation with a tmp file + fixed clock/idgen.
 *
 * Route checklist:
 *   GET  /__annotations          → 200 { state }
 *   POST /__annotations          → 200 { state } | 400 (invalid body)
 *   POST /__annotations/round    → 200 { state }
 *   any other                    → 404
 *
 * @lore AJ5: Security: story/variant/component/note are content fields only —
 * they are NEVER used to build a file path. Path is a single fixed location
 * resolved server-side. Body fields are validated to be strings (not objects)
 * to guard against prototype pollution or path-traversal-shaped payloads.
 *
 * @lore AJ5: Rate-limiting is N/A — dev-only middleware on localhost, single
 * founder session, not exposed. Prompt-injection risk (note field read by agent)
 * is N/A because the file is gitignored and the writer is trusted localhost dev.
 */

import { appendAnnotation, readState, startRound } from "./annotation-store.js";
import type { AnnotationInput, AnnotationState } from "./types.js";

// ---------------------------------------------------------------------------
// Body validation
// ---------------------------------------------------------------------------

/**
 * Validate that the POST body has the expected AnnotationInput shape.
 * All top-level string fields must be strings (never objects, arrays, etc.).
 * Rejects path-traversal-shaped payloads or type confusion attacks.
 */
function validateBody(body: unknown): body is AnnotationInput {
	if (body === null || typeof body !== "object" || Array.isArray(body)) return false;
	const b = body as Record<string, unknown>;
	if (typeof b["story"] !== "string") return false;
	if (typeof b["variant"] !== "string") return false;
	if (typeof b["note"] !== "string") return false;
	const target = b["target"];
	if (target === null || typeof target !== "object" || Array.isArray(target)) return false;
	const t = target as Record<string, unknown>;
	if (typeof t["component"] !== "string") return false;
	if (typeof t["element"] !== "string") return false;
	// dsComponent is string | null
	if (t["dsComponent"] !== null && typeof t["dsComponent"] !== "string") return false;
	return true;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function handleAnnotationRequest(
	file: string,
	method: string,
	pathname: string,
	body: unknown,
	clock: () => string,
	idgen: () => string,
): { status: number; json: unknown } {
	// Normalise pathname (strip trailing slash for robustness)
	const path = pathname.replace(/\/$/, "");

	// GET /__annotations → read state
	if (method === "GET" && path === "/__annotations") {
		const state: AnnotationState = readState(file);
		return { status: 200, json: { state } };
	}

	// POST /__annotations → append annotation
	if (method === "POST" && path === "/__annotations") {
		if (!validateBody(body)) {
			return { status: 400, json: { error: "Invalid request body" } };
		}
		const state = appendAnnotation(file, body, clock(), idgen());
		return { status: 200, json: { state } };
	}

	// POST /__annotations/round → start new round
	if (method === "POST" && path === "/__annotations/round") {
		const state = startRound(file, clock());
		return { status: 200, json: { state } };
	}

	// Anything else → 404
	return { status: 404, json: { error: "Not found" } };
}
