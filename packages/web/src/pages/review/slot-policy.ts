/**
 * AL5 — Slot policy declarations for all 9 ReviewCanvasKinds.
 *
 * Each canvas declares, per named slot, how a surface may extend it:
 *   "wrap"      — surface passes a slot node; base composes at the seam
 *   "eject"     — surface must copy the canvas source and own it
 *   "forbidden" — the slot is not a valid extension point for this canvas
 *
 * Only action_operation has wired seams in AL5. The other 8 are stubs
 * (eject-only) until their seams are wired in a fast-follow.
 *
 * @lore AL5 A4: The Docusaurus Safe/Unsafe/Forbidden taxonomy, made a typed
 * per-canvas declaration. The UNLISTED_SLOT_DEFAULT = "eject" is deliberate
 * and named — NOT a silent fallthrough. A stub canvas reads "eject-by-default"
 * rather than "we forgot to list it".
 */

import type { ReviewCanvasKind } from "@hyperidle/shared";
import type { SlotName, SlotPermission, SlotPolicy } from "./surface-slots.js";

export const SLOT_POLICY: Readonly<Record<ReviewCanvasKind, SlotPolicy>> = {
	// action_operation: 4 wired seams (AL5 proof vehicle). aside is forbidden.
	action_operation: {
		header: "wrap",
		lead: "wrap",
		detail: "wrap",
		footer: "wrap",
		aside: "forbidden",
	},
	// AL5 stubs — eject allowed, no wrap seams wired yet:
	outcome_summary: {},
	field_change_set: {},
	rendered_in_context: {},
	metrics_moved: {},
	visual_diff: {},
	code_diff: {},
	batch: {},
	browser_preview: {},
};

/**
 * A seam not listed in a canvas's policy is, by deliberate default, NOT a wrap
 * point — the only way to change that region is to eject. This default is
 * explicit (a named const), NOT a silent fallthrough, so the build of the 8
 * fast-follow canvases reads "eject-by-default" rather than "we forgot to list it".
 */
export const UNLISTED_SLOT_DEFAULT: SlotPermission = "eject";

/**
 * Look up the permission for a named slot on a canvas kind.
 * Returns the declared policy entry, or UNLISTED_SLOT_DEFAULT if not declared.
 */
export function slotPermission(kind: ReviewCanvasKind, name: SlotName): SlotPermission {
	return SLOT_POLICY[kind][name] ?? UNLISTED_SLOT_DEFAULT;
}
