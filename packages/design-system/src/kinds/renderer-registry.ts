// AF16 T9 — Renderer registry moved from packages/web/src/kinds/ to packages/design-system/src/kinds/.
// AE6 — Renderer registry: maps kind strings to React renderer components.
//
// Adding a new kind renderer:
// 1. Create the renderer component in packages/design-system/src/kinds/<kind>-renderer.tsx
// 2. Add it to the RENDERER_MAP below.
//
// @lore AE6 F2: Uses static imports (not require()) because packages/web is ESM.
// The original architecture sketch used require() for lazy loading — that would
// break ESM. Static imports are used here and the registry is a simple Map.
//
// @lore AF16 T9: Moved from packages/web/src/kinds/ to packages/design-system/src/kinds/ so
// ArtifactPreviewSurface (design-system) can dispatch through getRenderer() without an
// upward dependency on packages/web. Renderers are presentation primitives — design-system
// is their natural home. packages/web imports are updated to use @hyperidle/design-system.

import type { ComponentType } from "react";
import { CodeRenderer } from "./code-renderer.js";
import { DataRenderer } from "./data-renderer.js";
import { FallbackRenderer } from "./fallback-renderer.js";
import { HtmlRenderer } from "./html-renderer.js";
import { ImageRenderer } from "./image-renderer.js";
import { TextRenderer } from "./text-renderer.js";
import { UrlRenderer } from "./url-renderer.js";

export interface RendererProps {
	// biome-ignore lint/suspicious/noExplicitAny: preview shape varies by kind
	preview: any;
	kind: string;
}

export type RendererComponent = ComponentType<RendererProps>;

const RENDERER_MAP: ReadonlyMap<string, RendererComponent> = new Map([
	["text", TextRenderer as RendererComponent],
	["code", CodeRenderer as RendererComponent],
	["image", ImageRenderer as RendererComponent],
	["data", DataRenderer as RendererComponent],
	["html", HtmlRenderer as RendererComponent],
	["url", UrlRenderer as RendererComponent],
]);

/**
 * Look up the renderer component for a given kind.
 * Returns FallbackRenderer for unregistered kinds (open vocabulary).
 */
export function getRenderer(kind: string): RendererComponent {
	return RENDERER_MAP.get(kind) ?? (FallbackRenderer as RendererComponent);
}
