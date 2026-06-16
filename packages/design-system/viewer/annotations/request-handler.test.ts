/**
 * AJ5 — request-handler.test.ts
 *
 * TDD RED phase — imports modules that do not yet exist.
 * Expected failure: Cannot find module './request-handler.js'
 *
 * AC7: handleAnnotationRequest routes GET/POST/round → store and returns {status, json};
 *      bad POST body → 400; unknown path → 404.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { handleAnnotationRequest } from "./request-handler.js";
import type { AnnotationInput } from "./types.js";

// ---------------------------------------------------------------------------
// Inject fixed clock + idgen for deterministic tests
// ---------------------------------------------------------------------------

const FIXED_NOW = "2026-06-15T10:00:00.000Z";
let callCount = 0;
const fixedClock = (): string => FIXED_NOW;
const fixedIdgen = (): string => `id-${String(++callCount).padStart(4, "0")}`;

function makeTmpFile(): string {
	const dir = mkdtempSync(join(tmpdir(), "aj5-handler-test-"));
	return join(dir, "annotations.json");
}

let tmpFile: string;

beforeEach(() => {
	callCount = 0;
	tmpFile = makeTmpFile();
});

afterEach(() => {
	try {
		rmSync(join(tmpFile, ".."), { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
});

// ---------------------------------------------------------------------------
// AC7 — GET /__annotations → 200 state
// ---------------------------------------------------------------------------

describe("AC7 — GET /__annotations", () => {
	test("returns 200 with initial empty state", () => {
		const result = handleAnnotationRequest(
			tmpFile,
			"GET",
			"/__annotations",
			null,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(200);
		const json = result.json as { state: { currentRound: number; rounds: unknown[] } };
		expect(json.state).toBeDefined();
		expect(json.state.currentRound).toBe(1);
		expect(json.state.rounds).toHaveLength(1);
	});

	test("GET returns state after an annotation was appended", () => {
		const input: AnnotationInput = {
			story: "Button",
			variant: "AllVariants",
			note: "test note",
			target: { component: "Button", dsComponent: "Button", element: "button" },
		};
		// POST first
		handleAnnotationRequest(tmpFile, "POST", "/__annotations", input, fixedClock, fixedIdgen);
		// Then GET
		const result = handleAnnotationRequest(
			tmpFile,
			"GET",
			"/__annotations",
			null,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(200);
		const json = result.json as {
			state: { currentRound: number; rounds: Array<{ annotations: unknown[] }> };
		};
		expect(json.state.rounds[0]?.annotations).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// AC7 — POST /__annotations → appends annotation
// ---------------------------------------------------------------------------

describe("AC7 — POST /__annotations", () => {
	test("valid POST returns 200 with updated state", () => {
		const input: AnnotationInput = {
			story: "Button",
			variant: "AllVariants",
			note: "radius too tight",
			target: { component: "Button", dsComponent: "Button", element: "button.btn" },
		};
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			input,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(200);
		const json = result.json as {
			state: { rounds: Array<{ annotations: Array<{ id: string; createdAt: string }> }> };
		};
		expect(json.state.rounds[0]?.annotations).toHaveLength(1);
		expect(json.state.rounds[0]?.annotations[0]?.id).toBe("id-0001");
		expect(json.state.rounds[0]?.annotations[0]?.createdAt).toBe(FIXED_NOW);
	});

	test("POST uses injected idgen and clock", () => {
		const input: AnnotationInput = {
			story: "S",
			variant: "V",
			note: "note",
			target: { component: "C", dsComponent: null, element: "span" },
		};
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			input,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(200);
		const json = result.json as {
			state: { rounds: Array<{ annotations: Array<{ id: string; createdAt: string }> }> };
		};
		// idgen called once → "id-0001"
		expect(json.state.rounds[0]?.annotations[0]?.id).toBe("id-0001");
		// clock used → FIXED_NOW
		expect(json.state.rounds[0]?.annotations[0]?.createdAt).toBe(FIXED_NOW);
	});

	test("bad POST body (missing note) → 400", () => {
		const badBody = { story: "S", variant: "V" }; // missing note + target
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			badBody,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(400);
	});

	test("bad POST body (null) → 400", () => {
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			null,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(400);
	});

	test("bad POST body (note is not a string) → 400", () => {
		const badBody = {
			story: "S",
			variant: "V",
			note: 42, // wrong type
			target: { component: "C", dsComponent: null, element: "span" },
		};
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			badBody,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(400);
	});

	test("bad POST body (story is an object, path-traversal guard) → 400", () => {
		const badBody = {
			story: { $ne: null }, // object, not a string
			variant: "V",
			note: "note",
			target: { component: "C", dsComponent: null, element: "span" },
		};
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			badBody,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// AC6 (AJ7) — optional target.anchor (back-compat + validation)
// ---------------------------------------------------------------------------

describe("AC6 (AJ7) — target.anchor", () => {
	test("POST with a valid anchor → 200 and persists the anchor", () => {
		const input: AnnotationInput = {
			story: "Button",
			variant: "AllVariants",
			note: "radius",
			target: {
				component: "Button",
				dsComponent: "Button",
				element: "button.btn",
				anchor: { path: [0, 2, 1], component: "Button", element: "button.btn" },
			},
		};
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			input,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(200);
		const json = result.json as {
			state: {
				rounds: Array<{
					annotations: Array<{ target: { anchor?: { path: number[] } } }>;
				}>;
			};
		};
		expect(json.state.rounds[0]?.annotations[0]?.target.anchor?.path).toEqual([0, 2, 1]);
	});

	test("POST without an anchor (AJ5 shape) → 200 (back-compat)", () => {
		const input: AnnotationInput = {
			story: "Button",
			variant: "AllVariants",
			note: "n",
			target: { component: "Button", dsComponent: "Button", element: "button" },
		};
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			input,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(200);
	});

	test("malformed anchor (path is not a number[]) → 400", () => {
		const badBody = {
			story: "S",
			variant: "V",
			note: "n",
			target: {
				component: "C",
				dsComponent: null,
				element: "span",
				anchor: { path: ["a", "b"], component: "C", element: "span" },
			},
		};
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			badBody,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(400);
	});

	test("malformed anchor (component not a string) → 400", () => {
		const badBody = {
			story: "S",
			variant: "V",
			note: "n",
			target: {
				component: "C",
				dsComponent: null,
				element: "span",
				anchor: { path: [0], component: 42, element: "span" },
			},
		};
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations",
			badBody,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// AC7 — POST /__annotations/round → startRound
// ---------------------------------------------------------------------------

describe("AC7 — POST /__annotations/round", () => {
	test("returns 200 with bumped currentRound", () => {
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations/round",
			null,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(200);
		const json = result.json as { state: { currentRound: number; rounds: unknown[] } };
		expect(json.state.currentRound).toBe(2);
		expect(json.state.rounds).toHaveLength(2);
	});

	test("prior annotations preserved after round bump", () => {
		const input: AnnotationInput = {
			story: "S",
			variant: "V",
			note: "note",
			target: { component: "C", dsComponent: null, element: "span" },
		};
		handleAnnotationRequest(tmpFile, "POST", "/__annotations", input, fixedClock, fixedIdgen);
		handleAnnotationRequest(tmpFile, "POST", "/__annotations/round", null, fixedClock, fixedIdgen);
		const result = handleAnnotationRequest(
			tmpFile,
			"GET",
			"/__annotations",
			null,
			fixedClock,
			fixedIdgen,
		);
		const json = result.json as {
			state: { rounds: Array<{ annotations: unknown[] }> };
		};
		expect(json.state.rounds[0]?.annotations).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// AC7 — Unknown path → 404
// ---------------------------------------------------------------------------

describe("AC7 — unknown paths", () => {
	test("GET /__annotations/unknown → 404", () => {
		const result = handleAnnotationRequest(
			tmpFile,
			"GET",
			"/__annotations/unknown",
			null,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(404);
	});

	test("DELETE /__annotations → 404", () => {
		const result = handleAnnotationRequest(
			tmpFile,
			"DELETE",
			"/__annotations",
			null,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(404);
	});

	test("POST /__annotations/bogus → 404", () => {
		const result = handleAnnotationRequest(
			tmpFile,
			"POST",
			"/__annotations/bogus",
			null,
			fixedClock,
			fixedIdgen,
		);
		expect(result.status).toBe(404);
	});
});
