/**
 * X3 AC-2 — System prompt templates readable from docs/system-prompts/ via
 * the shared role→filename resolver.
 *
 * @lore AU18: AC-2 previously asserted templates were cached into
 * `factory_settings.system_template:<role>` rows by seed(). That table is
 * retired — templates are now read directly via `readSystemPromptTemplateForRole`
 * (system-prompt-templates.ts), the same resolver `roster.ts`/`agents.ts` use
 * at request time.
 *
 * @lore AU29: relocated verbatim from `framework/db/src/__tests__/X3-agent-
 * config.integration.test.ts` (task A) — `system-prompt-templates.ts` moved
 * here, and this describe block never touched a database (no `{db}` fixture),
 * so it is a plain unit test, not integration.
 */

import { describe, expect, test } from "vitest";
import { readSystemPromptTemplateForRole } from "../system-prompt-templates.js";

describe("X3 AC-2: system prompt templates readable from docs/system-prompts/ via the shared resolver", () => {
	test("product_manager template resolves with non-empty content, no frontmatter", () => {
		const content = readSystemPromptTemplateForRole("product_manager");
		expect(content).toBeTruthy();
		expect((content ?? "").length).toBeGreaterThan(50);
		expect(content).not.toMatch(/^---/);
	});

	// @lore AD8c: key renamed from system_template:practice_facilitator to system_template:facilitator
	test("facilitator template resolves with non-empty content, no frontmatter (AD8c)", () => {
		const content = readSystemPromptTemplateForRole("facilitator");
		expect(content).toBeTruthy();
		expect((content ?? "").length).toBeGreaterThan(50);
		expect(content).not.toMatch(/^---/);
	});

	// @lore AD8c: old role name must not resolve after rename
	test("practice_facilitator does NOT resolve (AD8c renamed)", () => {
		expect(readSystemPromptTemplateForRole("practice_facilitator")).toBeNull();
	});

	// @lore AD8a: chief_of_staff system prompt deleted — docs/system-prompts/chief-of-staff.md removed.
	// AD8b adds assistant.md but the map deliberately excludes "assistant" (bootstrap never
	// seeded it, so the route stays 404 — see system-prompt-templates.ts).
	test("chief_of_staff does NOT resolve (AD8a: system prompt deleted)", () => {
		expect(readSystemPromptTemplateForRole("chief_of_staff")).toBeNull();
	});

	test("product_manager template content contains recognizable persona content", () => {
		const content = readSystemPromptTemplateForRole("product_manager") ?? "";
		expect(content).toMatch(/#|You are|Product Manager|PM/i);
	});

	// AB0: builder and growth now have templates (docs/system-prompts/builder.md, docs/system-prompts/growth.md added)
	test("builder template resolves (AB0 added docs/system-prompts/builder.md)", () => {
		expect(readSystemPromptTemplateForRole("builder")).not.toBeNull();
	});

	test("growth template resolves (AB0 added docs/system-prompts/growth.md)", () => {
		expect(readSystemPromptTemplateForRole("growth")).not.toBeNull();
	});
});
