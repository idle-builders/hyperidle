// AE6 — Kind registry.
// Registers the 6 fundamental kinds and provides lookup functions.

import { codeKind } from "./code.js";
import { dataKind } from "./data.js";
import { htmlKind } from "./html.js";
import { imageKind } from "./image.js";
import type { KindDefinition } from "./kind-definition.js";
import { textKind } from "./text.js";
import { urlKind } from "./url.js";

/**
 * @lore AE6: Registry is a Map rather than auto-discovered import.meta.glob
 * because import.meta.glob is Vite-specific and doesn't work in the Node server.
 * Adding a new kind = create Kind Definition module + add one import + one entry here.
 * This is "configuration" not "core logic" — same pattern as adding a Hono route.
 * See plans/AE6/architecture.md §1.3 for the design-it-twice analysis.
 */
const REGISTRY: ReadonlyMap<string, KindDefinition> = new Map([
	[textKind.kind, textKind],
	[codeKind.kind, codeKind],
	[imageKind.kind, imageKind],
	[dataKind.kind, dataKind],
	[htmlKind.kind, htmlKind],
	[urlKind.kind, urlKind],
]);

/** The 6 fundamental artifact kind strings. */
export const ARTIFACT_KINDS = ["text", "code", "image", "data", "html", "url"] as const;

/** The union type of all registered kind strings. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * Look up a Kind Definition by kind string.
 * Returns undefined for unregistered kinds (caller renders fallback).
 */
export function getKindDefinition(kind: string): KindDefinition | undefined {
	return REGISTRY.get(kind);
}

/**
 * Check if a kind string is registered.
 * Type guard: narrows to ArtifactKind when true.
 */
export function isRegisteredKind(kind: string): kind is ArtifactKind {
	return REGISTRY.has(kind);
}
