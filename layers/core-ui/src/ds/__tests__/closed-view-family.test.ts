// L3 RED — protected test: closed view family for Artifact components.
//
// Asserts:
// 1. The DS export boundary publishes EXACTLY the 1 named export (ArtifactFrame).
// 2. There is NO ambiguous `Artifact` or `ArtifactCard` export.
// 3. There is NO unlisted Artifact*.tsx file in ds/ outside the allow-list.
//
// @lore AU21 Increment 14a: ArtifactCostChip (a sub-primitive) is deleted
// along with the rest of the cost feature — the family shrinks from 8 to 7.
//
// @lore AZ6: ArtifactFrame joins the family — 7 to 8. It is a deliberate addition,
// not a fifth layout: the four layouts are how the app FRAMES an artifact, and
// ArtifactFrame is how an artifact of the `html` kind RUNS — its own document,
// sealed. No existing export does that job; HtmlPayload renders sanitised
// fragments into the app's own document, which is the opposite thing.
//
// @lore AU43 bundle-03: ArtifactEmbed deleted — only door was /_dev/artifacts (DEV-ONLY).
// Family shrinks from 8 to 7.
//
// @lore artifacts-become-documents: ArtifactGalleryCard, ArtifactKindBadge,
// ArtifactPreview, ArtifactPreviewSurface, ArtifactStackItem, ArtifactTimestamp
// deleted by prior builders when artifacts became knowledge items. Only ArtifactFrame
// survives — it renders the HTML sandbox iframe for html-kind knowledge items.
// Family shrinks from 7 to 1.

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as Ds from "../index.js";

const ALLOWED = ["ArtifactFrame"] as const;

describe("Artifact closed view family — export boundary (protected)", () => {
	it("exports exactly the 1 allowed Artifact* name — no more, no less", () => {
		const exported = Object.keys(Ds).filter((k) => /^Artifact/.test(k));
		expect(exported.sort()).toEqual([...ALLOWED].sort());
	});

	it("does NOT export an ambiguous bare 'Artifact' symbol", () => {
		expect(Object.keys(Ds)).not.toContain("Artifact");
	});

	it("does NOT export 'ArtifactCard' (would suggest layouts are interchangeable)", () => {
		expect(Object.keys(Ds)).not.toContain("ArtifactCard");
	});

	it("there is no unlisted Artifact*.tsx file in ds/ outside the allow-list", () => {
		const dir = resolve(__dirname, "..");
		const files = readdirSync(dir).filter(
			(f) => /^Artifact[A-Z][A-Za-z]*\.tsx$/.test(f) && !/\.stories\.tsx$/.test(f),
		);
		const componentNames = files.map((f) => f.replace(/\.tsx$/, "")).sort();
		expect(componentNames).toEqual([...ALLOWED].sort());
	});
});
