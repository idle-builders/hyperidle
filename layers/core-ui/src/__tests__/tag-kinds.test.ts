import { describe, expect, it } from "vitest";
import { TAG_KIND_ICONS, type TagKind } from "../ds";

// J1 — Tag kind centralised map shape test.
// The map must define entries for the three Tier-2 Tag kinds so that consumers
// (Tag.tsx + downstream agents that read document taxonomies) get a single
// source of truth instead of scattering icon/tint duplicates across the codebase.

describe("TAG_KIND_ICONS map", () => {
	it("defines exactly the three Tier-2 kinds: pattern, decision, failure", () => {
		const keys = Object.keys(TAG_KIND_ICONS).sort();
		expect(keys).toEqual(["decision", "failure", "pattern"]);
	});

	it.each<TagKind>(["pattern", "decision", "failure"])(
		"entry for %s has icon, tintClass, and ariaLabel",
		(kind) => {
			const meta = TAG_KIND_ICONS[kind];
			expect(meta).toBeDefined();
			expect(meta.icon).toBeDefined();
			expect(typeof meta.tintClass).toBe("string");
			expect(meta.tintClass.length).toBeGreaterThan(0);
			expect(typeof meta.ariaLabel).toBe("string");
			expect(meta.ariaLabel.length).toBeGreaterThan(0);
		},
	);

	it("all ariaLabels are unique (no duplicates between kinds)", () => {
		const labels = Object.values(TAG_KIND_ICONS).map((m) => m.ariaLabel);
		expect(new Set(labels).size).toBe(labels.length);
	});

	it("no tintClass uses the banned text-base-content/XX token", () => {
		// Token hygiene mirror of `no-base-content-text-tokens.test.ts`.
		for (const meta of Object.values(TAG_KIND_ICONS)) {
			expect(meta.tintClass).not.toMatch(/text-base-content\//);
		}
	});
});
