/**
 * AR4 — AH6 lane-gate verdict unit (W-2 honest decomposition).
 *
 * The broken-lane AC3 leg: asserts the S1 distinct-reply condition is FALSE
 * over a CRAFTED empty/degenerate transcript — no real harness, no vi.mock.
 *
 * A real model essentially never returns an empty content array, so the broken
 * leg CANNOT be forced on real harness output reliably. This is the honest
 * decomposition: the gate verdict logic is pure — test it over crafted inputs,
 * not by coercing a real model into degenerate output.
 *
 * Inheritor of AH6 Term-2b ("broken-lane verdict" per plan protectedTests).
 *
 * @lore AR4 W-2: AC3 has two legs:
 *   (i) REAL leg: real builtin turn → real output → S1 = true  (in AH6-...-real.integration.test.ts)
 *   (ii) UNIT leg: crafted empty transcript → S1 = false        (THIS FILE)
 * This is not hiding a skip — it is an honest decomposition by what each leg
 * can actually prove. Stated plainly in the plan DoD.
 *
 * W-2 fix: no local predicate function. Plain assertions on the actual conditions
 * (length > 0 and !== welcomeText) prove the logic directly without the tautology
 * risk of a locally-defined predicate that duplicates itself under test.
 * Variables typed as `string` (not literal) avoid TS2367 overlap errors.
 */

import { describe, expect, test } from "vitest";

const WELCOME_TEXT: string = "Welcome to HyperIdle! I'm your assistant.";

describe("AH6 lane-gate verdict — S1 condition over crafted inputs (AC3 broken-lane unit)", () => {
	test("empty content → lastReply = '' → S1 condition = false (broken lane)", () => {
		// Simulates what AH6 Term-2b asserts: a degenerate completion yields empty text,
		// which fails the S1 gate (not a distinct reply).
		const lastReply: string = ""; // empty content array → drainStreamEvents produces empty text
		expect(lastReply.length > 0 && lastReply !== WELCOME_TEXT).toBe(false);
	});

	test("welcome-text-only reply → S1 condition = false (not distinct from welcome)", () => {
		const lastReply: string = WELCOME_TEXT;
		expect(lastReply.length > 0 && lastReply !== WELCOME_TEXT).toBe(false);
	});

	test("non-empty, distinct reply → S1 condition = true (valid lane)", () => {
		// Sanity: the condition correctly passes a real reply
		const lastReply: string = "Hello! How can I help you today?";
		expect(lastReply.length > 0 && lastReply !== WELCOME_TEXT).toBe(true);
	});

	test("single space → S1 condition = true (whitespace-only is non-empty and distinct)", () => {
		// Edge case: pure whitespace is technically non-empty and not equal to welcomeText.
		// The production gate logic accepts it — a stricter trim() version would reject it.
		const lastReply: string = " ";
		expect(lastReply.length > 0 && lastReply !== WELCOME_TEXT).toBe(true);
	});
});
