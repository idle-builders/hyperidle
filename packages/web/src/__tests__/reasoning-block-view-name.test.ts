/**
 * L2 T29 / component-budget name guard: ReasoningBlockView is the canonical
 * export. ReasoningBlock (without the suffix) MUST NOT be re-exported.
 * See docs/ui-design/component-budget.md.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS_DIR = resolve(__dirname, "../components");

describe("ReasoningBlockView naming guard", () => {
	it("ReasoningBlockView.tsx exists", () => {
		expect(existsSync(resolve(COMPONENTS_DIR, "ReasoningBlockView.tsx"))).toBe(true);
	});

	it("ReasoningBlock.tsx (the old name) is gone", () => {
		expect(existsSync(resolve(COMPONENTS_DIR, "ReasoningBlock.tsx"))).toBe(false);
	});

	it("ReasoningBlockView.stories.tsx exists", () => {
		expect(existsSync(resolve(COMPONENTS_DIR, "ReasoningBlockView.stories.tsx"))).toBe(true);
	});

	it("module exports ReasoningBlockView and not ReasoningBlock", async () => {
		const mod = (await import("../components/ReasoningBlockView.js")) as Record<string, unknown>;
		expect(mod.ReasoningBlockView).toBeDefined();
		expect(mod.ReasoningBlock).toBeUndefined();
	});
});
