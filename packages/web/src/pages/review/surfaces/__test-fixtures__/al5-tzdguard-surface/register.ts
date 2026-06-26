/**
 * AL5 TDZ-GUARD FIXTURE — auto-generated register.ts simulation.
 *
 * This file mimics exactly what `surface:add` generates in
 * packages/web/src/pages/review/surfaces/<id>/register.ts.
 *
 * CRITICAL: It imports registerSurface from "../../surface-registry-api.js"
 * (NOT from "../../surface-registry.js"). This is the TDZ-safe path.
 *
 * @lore AL5 TDZ-FIX: If this import were changed to "../../surface-registry.js",
 * the AL5-tzdguard-import-chain.test.tsx test would fail with:
 *   ReferenceError: Cannot access 'REGISTRY' before initialization
 * because surface-registry.ts imports surface-registry.generated.ts which
 * imports this file — a circular chain that hits the TDZ for REGISTRY.
 * The test imports surface-registry.ts (which pulls in the generated chain),
 * so the TDZ crash manifests at test import time, not at runtime.
 */

import type { ReviewCanvasComponent } from "../../../review-artifact.js";
import { registerSurface } from "../../surface-registry-api.js";
import { TzdGuardSurface } from "./TzdGuardSurface.js";

const manifest = {
	id: "al5-tzdguard-fixture",
	title: "AL5 TDZ-Guard Fixture",
	description: "Static test fixture proving register.ts works through the generated-index chain.",
	author: "HyperIdle Test <test@hyperidle.com>",
	version: "1.0.0",
	baseCanvas: "action_operation",
	layering: "wrap",
	provenance: "community",
	situations: [{ tool: "al5-tzdguard", kind: "action_operation" }],
	sampleFixture: "al5-tzdguard",
} as const;

// Register the surface — called once at module-load time (side-effecting import).
registerSurface(
	manifest as Parameters<typeof registerSurface>[0],
	TzdGuardSurface as ReviewCanvasComponent,
);
