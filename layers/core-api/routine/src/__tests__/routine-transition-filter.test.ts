/**
 * BA9d D11 — parseTransitionTo unit tests.
 *
 * parseTransitionTo extracts the `transitionTo` string from a JSON trigger_config
 * blob. It is the single parser for the transition constraint; the matcher in
 * routine-scheduler.ts uses it to decide whether to fire a routine.
 */
import { describe, expect, test } from "vitest";
import { parseTransitionTo } from "../routine-service.js";

describe("parseTransitionTo", () => {
	test("returns null when triggerConfig is null", () => {
		expect(parseTransitionTo(null)).toBeNull();
	});

	test("returns null when triggerConfig is undefined", () => {
		expect(parseTransitionTo(undefined)).toBeNull();
	});

	test("returns null when triggerConfig is empty string", () => {
		expect(parseTransitionTo("")).toBeNull();
	});

	test("returns null when JSON has no transitionTo key", () => {
		expect(parseTransitionTo(JSON.stringify({ cron: "0 8 * * *" }))).toBeNull();
	});

	test("returns the transitionTo value when present", () => {
		expect(parseTransitionTo(JSON.stringify({ transitionTo: "done" }))).toBe("done");
	});

	test("returns null when transitionTo is not a string", () => {
		expect(parseTransitionTo(JSON.stringify({ transitionTo: 42 }))).toBeNull();
	});

	test("returns null on invalid JSON", () => {
		expect(parseTransitionTo("{not-json")).toBeNull();
	});

	test("handles other keys alongside transitionTo", () => {
		expect(parseTransitionTo(JSON.stringify({ transitionTo: "in_progress", other: true }))).toBe(
			"in_progress",
		);
	});
});
