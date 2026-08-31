/**
 * The rules that decide what a configured agent's options do to its invocation.
 *
 * The load-bearing one is the last group: an agent with no usable options must
 * add nothing at all, because that is what makes an agent configured before this
 * feature existed run exactly as it did before.
 */

import { describe, expect, test } from "vitest";
import { modelOptionArgv, reconcileModelOptions } from "../model-options.js";

describe("model options reaching a harness", () => {
	test("a configured option becomes the harness's own spelling", () => {
		expect(modelOptionArgv("claude-code", { effort: "high" })).toEqual(["--effort", "high"]);
		// codex takes a config override rather than a flag.
		expect(modelOptionArgv("codex", { model_reasoning_effort: "xhigh" })).toEqual([
			"-c",
			"model_reasoning_effort=xhigh",
		]);
		expect(modelOptionArgv("opencode", { variant: "max" })).toEqual(["--variant", "max"]);
	});

	test("a harness that declares nothing carries nothing, whatever is stored", () => {
		expect(modelOptionArgv("cursor-agent", { effort: "high" })).toEqual([]);
		// A harness type outside the vocabulary declares nothing either — the
		// stored options are dropped rather than guessed at.
		expect(modelOptionArgv("not-a-harness", { reasoning_effort: "high" })).toEqual([]);
	});

	test("an option stored for a different harness is dropped, not carried across", () => {
		// An agent keeps its options when it switches harness, so a stored set can
		// legitimately hold a key this harness never declared.
		expect(modelOptionArgv("claude-code", { variant: "max", effort: "low" })).toEqual([
			"--effort",
			"low",
		]);
		expect(reconcileModelOptions("claude-code", { variant: "max" })).toEqual({});
	});

	test("a value the binary would reject is dropped where we know the valid set", () => {
		// claude's list is known at compile time, so a stale value never reaches the
		// binary — an unknown --effort value would otherwise crash the session.
		expect(modelOptionArgv("claude-code", { effort: "ludicrous" })).toEqual([]);
		expect(modelOptionArgv("claude-code", { effort: "max" })).toEqual(["--effort", "max"]);
	});

	test("a value we cannot check is passed through rather than dropped", () => {
		// codex and opencode publish their choices through a probe, and a failed
		// probe is indistinguishable from "no options". Enforcing an absent list
		// would strip a user's configuration whenever the network hiccuped.
		expect(modelOptionArgv("opencode", { variant: "something-new" })).toEqual([
			"--variant",
			"something-new",
		]);
	});

	test("an agent with no options adds nothing to its invocation", () => {
		expect(modelOptionArgv("claude-code", undefined)).toEqual([]);
		expect(modelOptionArgv("claude-code", {})).toEqual([]);
		expect(modelOptionArgv("codex", {})).toEqual([]);
		expect(modelOptionArgv("opencode", undefined)).toEqual([]);
		// An unknown harness is not a crash — it simply carries nothing.
		expect(modelOptionArgv("some-future-harness", { effort: "high" })).toEqual([]);
	});
});
