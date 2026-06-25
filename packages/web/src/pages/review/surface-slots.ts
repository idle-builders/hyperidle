/**
 * AL5 — Slot contract: the seams a base canvas may expose to surfaces.
 *
 * SlotName is the vocabulary of declared seams. Each base canvas declares, per
 * slot, how a surface may extend it (wrap | eject | forbidden). The slot()
 * helper is used by base canvases to compose slot nodes at declared seams.
 */

import type { ReactNode } from "react";

/**
 * The seams a base canvas may expose. CLOSED per-canvas; OPEN as a vocabulary
 * (each canvas declares its own subset). Names are stable contract.
 */
export type SlotName =
	| "header" // above the canvas card body (after CanvasSourceHeader)
	| "lead" // the canvas's primary summary region
	| "detail" // the main body / receipt / change-set region
	| "aside" // a right/secondary column
	| "footer"; // below the body, before card edge

export type SlotPermission = "wrap" | "eject" | "forbidden";

/**
 * A base canvas declares, per slot, how a surface may extend it.
 * Only named slots are declared; unlisted slots default to UNLISTED_SLOT_DEFAULT.
 */
export type SlotPolicy = Readonly<Partial<Record<SlotName, SlotPermission>>>;

/**
 * What a wrapping surface passes in. A node OVERRIDES the base region;
 * absence => the base renders its own default. `forbidden` slots are type-rejected
 * at author time via the per-canvas policy (see slot-policy.ts) + lint (AC5).
 */
export type CanvasSlots = Readonly<Partial<Record<SlotName, ReactNode>>>;

/**
 * Slot composition helper. A base canvas calls slot(slots, "lead", <DefaultLead />)
 * at each seam it supports. Returns the overriding slot node if provided,
 * otherwise the base's own default.
 *
 * @lore AL5 A1: Named `slot` (not `getSlot`) to read like a JSX seam declaration.
 * The slots bag is undefined when no surface is active — pure optional chain.
 */
export function slot(
	slots: CanvasSlots | undefined,
	name: SlotName,
	fallback: ReactNode,
): ReactNode {
	return slots?.[name] ?? fallback;
}
