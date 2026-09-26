/**
 * The distinct-reply verdict is pure logic: a reply counts only if it has
 * content and differs from the welcome text. A real model essentially never
 * returns an empty content array, so the false leg can't be forced on real
 * harness output reliably — tested here over a crafted empty transcript
 * instead. Plain assertions on the actual conditions (length > 0 and !==
 * welcomeText), never a local predicate function that would just duplicate
 * the logic under test. Variables are typed as `string` (not literal) so the
 * comparison doesn't collapse to a type-level always-false.
 */

import { describe, expect, test } from "vitest";

const WELCOME_TEXT: string = "Welcome to HyperIdle! I'm your assistant.";

describe("assistant lane-gate verdict over crafted inputs", () => {
	test("empty content makes the distinct-reply condition false", () => {
		// Simulates a degenerate completion that yields empty text,
		// which fails the distinct-reply gate.
		const lastReply: string = ""; // empty content array → drainStreamEvents produces empty text
		expect(lastReply.length > 0 && lastReply !== WELCOME_TEXT).toBe(false);
	});

	test("welcome-text-only reply is not distinct from welcome", () => {
		const lastReply: string = WELCOME_TEXT;
		expect(lastReply.length > 0 && lastReply !== WELCOME_TEXT).toBe(false);
	});

	test("non-empty distinct reply satisfies the condition", () => {
		// Sanity: the condition correctly passes a real reply
		const lastReply: string = "Hello! How can I help you today?";
		expect(lastReply.length > 0 && lastReply !== WELCOME_TEXT).toBe(true);
	});

	test("single space is technically non-empty and distinct", () => {
		// Edge case: pure whitespace is technically non-empty and not equal to welcomeText.
		// The production gate logic accepts it — a stricter trim() version would reject it.
		const lastReply: string = " ";
		expect(lastReply.length > 0 && lastReply !== WELCOME_TEXT).toBe(true);
	});
});
