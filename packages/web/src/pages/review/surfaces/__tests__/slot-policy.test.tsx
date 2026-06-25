/**
 * AL5 — Slot policy tests.
 *
 * Verifies:
 *   - SLOT_POLICY covers all 9 ReviewCanvasKinds (completeness)
 *   - action_operation declares header/lead/detail/footer as "wrap" and aside as "forbidden"
 *   - slotPermission() returns the declared value for named slots
 *   - UNLISTED_SLOT_DEFAULT is "eject" (deliberate default for unwired canvases)
 *   - The slot() helper: returns the slot value when provided, fallback when not
 *
 * RED PHASE: imports from modules that do not exist yet.
 */

import { describe, expect, it } from "vitest";
import {
	SLOT_POLICY,
	UNLISTED_SLOT_DEFAULT,
	slotPermission,
} from "../../slot-policy.js";
import type { SlotName, SlotPermission } from "../../surface-slots.js";
import { slot } from "../../surface-slots.js";

describe("AL5 — SLOT_POLICY all 9 canvas kinds", () => {
	const ALL_KINDS = [
		"outcome_summary",
		"field_change_set",
		"action_operation",
		"rendered_in_context",
		"metrics_moved",
		"visual_diff",
		"code_diff",
		"batch",
		"browser_preview",
	] as const;

	it("has an entry for every ReviewCanvasKind", () => {
		for (const kind of ALL_KINDS) {
			expect(SLOT_POLICY).toHaveProperty(kind);
		}
	});

	it("has exactly 9 entries (no extra kinds)", () => {
		expect(Object.keys(SLOT_POLICY)).toHaveLength(9);
	});
});

describe("AL5 — action_operation slot policy", () => {
	it("action_operation declares 'wrap' for header slot", () => {
		// Architecture §1.4: action_operation exposes wrap seams at header/lead/detail/footer.
		expect(SLOT_POLICY.action_operation.header).toBe("wrap");
	});

	it("action_operation declares 'wrap' for lead slot", () => {
		expect(SLOT_POLICY.action_operation.lead).toBe("wrap");
	});

	it("action_operation declares 'wrap' for detail slot", () => {
		expect(SLOT_POLICY.action_operation.detail).toBe("wrap");
	});

	it("action_operation declares 'wrap' for footer slot", () => {
		expect(SLOT_POLICY.action_operation.footer).toBe("wrap");
	});

	it("action_operation declares 'forbidden' for aside slot", () => {
		// Architecture §1.3: aside is declared unused / forbidden for action_operation.
		expect(SLOT_POLICY.action_operation.aside).toBe("forbidden");
	});
});

describe("AL5 — slotPermission() lookup", () => {
	it("returns declared 'wrap' for action_operation:header", () => {
		expect(slotPermission("action_operation", "header")).toBe("wrap");
	});

	it("returns declared 'forbidden' for action_operation:aside", () => {
		expect(slotPermission("action_operation", "aside")).toBe("forbidden");
	});

	it("returns UNLISTED_SLOT_DEFAULT for an unlisted slot on a stub canvas", () => {
		// Architecture §1.4: unlisted slot = EJECT by deliberate default, not silent fallthrough.
		// outcome_summary is a stub canvas (no wrap seams wired in AL5).
		const perm: SlotPermission = slotPermission("outcome_summary", "header");
		expect(perm).toBe(UNLISTED_SLOT_DEFAULT);
	});

	it("UNLISTED_SLOT_DEFAULT is 'eject'", () => {
		// Architecture §1.4: "eject-by-default" rather than "we forgot to list it".
		expect(UNLISTED_SLOT_DEFAULT).toBe("eject");
	});
});

describe("AL5 — slot() helper", () => {
	it("returns the provided slot node when present", () => {
		const slotNode = <span data-testid="override">Override</span>;
		const fallback = <span>Default</span>;
		const slotName: SlotName = "lead";
		const result = slot({ lead: slotNode }, slotName, fallback);
		expect(result).toBe(slotNode);
	});

	it("returns fallback when slot is undefined", () => {
		const fallback = <span>Default</span>;
		const result = slot({}, "lead", fallback);
		expect(result).toBe(fallback);
	});

	it("returns fallback when slots bag is undefined", () => {
		const fallback = <span>Default</span>;
		const result = slot(undefined, "lead", fallback);
		expect(result).toBe(fallback);
	});

	it("handles footer slot override", () => {
		const footerNode = <footer>Footer Override</footer>;
		const result = slot({ footer: footerNode }, "footer", null);
		expect(result).toBe(footerNode);
	});
});
