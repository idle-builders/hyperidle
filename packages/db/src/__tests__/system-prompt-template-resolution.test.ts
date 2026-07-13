/**
 * AU18 §9 — `readSystemPromptTemplateForRole` unit tests (round 3 CRITICAL #4
 * regression guard). The positive cases for the underscore roles
 * (`product_manager`, `qa_engineer`) are the exact case that would have
 * caught the round-2 regex + `${role}.md` bug: those roles map to hyphenated
 * filenames, not a same-stem `.md`.
 */

import { describe, expect, test } from "vitest";
import {
	readSystemPromptTemplateForRole,
	SYSTEM_PROMPT_TEMPLATE_FILES,
} from "../system-prompt-templates.js";

describe("SYSTEM_PROMPT_TEMPLATE_FILES", () => {
	test("has exactly the 7 canonical roles", () => {
		expect(Object.keys(SYSTEM_PROMPT_TEMPLATE_FILES).sort()).toEqual(
			[
				"builder",
				"designer",
				"facilitator",
				"growth",
				"ops",
				"product_manager",
				"qa_engineer",
			].sort(),
		);
	});

	test("underscore roles map to hyphenated filenames", () => {
		expect(SYSTEM_PROMPT_TEMPLATE_FILES.product_manager).toBe("product-manager.md");
		expect(SYSTEM_PROMPT_TEMPLATE_FILES.qa_engineer).toBe("qa-engineer.md");
	});

	test("does not include assistant", () => {
		expect(SYSTEM_PROMPT_TEMPLATE_FILES.assistant).toBeUndefined();
	});
});

describe("readSystemPromptTemplateForRole — positive, real seeded roles", () => {
	test("product_manager resolves the hyphenated product-manager.md content (underscore→hyphen regression guard)", () => {
		const content = readSystemPromptTemplateForRole("product_manager");
		expect(content).not.toBeNull();
		expect(content).toMatch(/#|Product Manager|PM/i);
		expect(content).not.toMatch(/^---/);
	});

	test("qa_engineer resolves the hyphenated qa-engineer.md content (second hyphenated-file role)", () => {
		const content = readSystemPromptTemplateForRole("qa_engineer");
		expect(content).not.toBeNull();
		expect(content).not.toMatch(/^---/);
	});

	test("builder resolves the same-stem builder.md content (sanity)", () => {
		const content = readSystemPromptTemplateForRole("builder");
		expect(content).not.toBeNull();
		expect(content).not.toMatch(/^---/);
	});

	test("facilitator, growth, designer, ops all resolve non-null content", () => {
		for (const role of ["facilitator", "growth", "designer", "ops"]) {
			expect(readSystemPromptTemplateForRole(role)).not.toBeNull();
		}
	});
});

describe("readSystemPromptTemplateForRole — preserved-404 cases", () => {
	test("assistant returns null (not in the map — matches today's 404)", () => {
		expect(readSystemPromptTemplateForRole("assistant")).toBeNull();
	});

	test("unknown role returns null", () => {
		expect(readSystemPromptTemplateForRole("sales")).toBeNull();
	});
});

describe("readSystemPromptTemplateForRole — negative traversal cases", () => {
	test("path traversal sequences never reach the filesystem — all resolve null", () => {
		const attempts = [
			"../etc/passwd",
			"..%2f...",
			"..",
			"../../../../etc/passwd",
			"product_manager/../../../etc/passwd",
		];
		for (const attempt of attempts) {
			expect(readSystemPromptTemplateForRole(attempt)).toBeNull();
		}
	});

	test("uppercase role variant is rejected (map keys are exact, case-sensitive)", () => {
		expect(readSystemPromptTemplateForRole("PRODUCT_MANAGER")).toBeNull();
	});

	test("empty string is rejected", () => {
		expect(readSystemPromptTemplateForRole("")).toBeNull();
	});
});
