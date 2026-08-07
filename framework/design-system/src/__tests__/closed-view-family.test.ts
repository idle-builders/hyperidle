// L3 RED — protected test: closed view family for Artifact components.
// Source of truth: plans/L3/architecture.md §9, §12; concept §4.5 hard rule #2.
//
// Asserts:
// 1. The DS export boundary publishes EXACTLY the 7 named exports (4 layouts + 3 sub-primitives).
// 2. There is NO ambiguous `Artifact` or `ArtifactCard` export.
// 3. There is NO 5th layout file in `framework/design-system/src/Artifact*.tsx` outside the allow-list.
//
// @lore AU21 Increment 14a: ArtifactCostChip (a sub-primitive) is deleted
// along with the rest of the cost feature — the family shrinks from 8 to 7.

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as Ds from "../index.js";

const ALLOWED = [
	"ArtifactKindBadge",
	"ArtifactTimestamp",
	"ArtifactPreviewSurface",
	"ArtifactGalleryCard",
	"ArtifactStackItem",
	"ArtifactPreview",
	"ArtifactEmbed",
] as const;

describe("Artifact closed view family — export boundary (protected)", () => {
	it("exports exactly the 7 allowed Artifact* names — no more, no less", () => {
		const exported = Object.keys(Ds).filter((k) => /^Artifact/.test(k));
		expect(exported.sort()).toEqual([...ALLOWED].sort());
	});

	it("does NOT export an ambiguous bare 'Artifact' symbol", () => {
		expect(Object.keys(Ds)).not.toContain("Artifact");
	});

	it("does NOT export 'ArtifactCard' (would suggest layouts are interchangeable)", () => {
		expect(Object.keys(Ds)).not.toContain("ArtifactCard");
	});

	it("there is no 5th Artifact* layout file in design-system/src/ outside the allow-list", () => {
		const dir = resolve(__dirname, "..");
		const files = readdirSync(dir).filter(
			(f) => /^Artifact[A-Z][A-Za-z]*\.tsx$/.test(f) && !/\.stories\.tsx$/.test(f),
		);
		const componentNames = files.map((f) => f.replace(/\.tsx$/, "")).sort();
		expect(componentNames).toEqual([...ALLOWED].sort());
	});
});
