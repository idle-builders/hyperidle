/**
 * AI4 — One status language: notification shortLabel registry tests (red phase)
 *
 * Decision 4 / AC4: NOTIFICATION_TYPES gains a `shortLabel` field (uppercase
 * literal) and a `shortLabelForType()` helper so NotificationPopover can derive
 * its compact type label from shared instead of a local TYPE_LABELS map.
 *
 * AF8-NotificationPopover.test.tsx:171 asserts getByText("REVIEW") — the
 * shortLabel for review_request must be the uppercase literal "REVIEW" so
 * the DOM textContent matches (casing contract Decision 1a).
 *
 * These tests FAIL until `shortLabel` is added to `NotificationType` interface
 * and to each NOTIFICATION_TYPES entry, and `shortLabelForType` is exported.
 */

import { describe, expect, it } from "vitest";
import {
	NOTIFICATION_TYPES,
	type NotificationType,
	type NotificationTypeKey,
	shortLabelForType,
} from "../notifications.js";

describe("NotificationType.shortLabel (AI4 Decision 4)", () => {
	it("every NOTIFICATION_TYPES entry has a shortLabel field", () => {
		for (const entry of NOTIFICATION_TYPES) {
			expect(
				(entry as NotificationType & { shortLabel?: string }).shortLabel,
				`entry "${entry.key}" must have shortLabel`,
			).toBeDefined();
		}
	});

	it("every shortLabel is a non-empty string", () => {
		for (const entry of NOTIFICATION_TYPES) {
			const label = (entry as NotificationType & { shortLabel?: string }).shortLabel;
			expect(typeof label).toBe("string");
			expect((label as string).length).toBeGreaterThan(0);
		}
	});

	it("review_request shortLabel is 'REVIEW' (uppercase, casing contract Decision 1a)", () => {
		const entry = NOTIFICATION_TYPES.find((t) => t.key === "review_request");
		expect(entry).toBeDefined();
		expect((entry as NotificationType & { shortLabel: string }).shortLabel).toBe("REVIEW");
	});

	it("blocker_alert shortLabel is 'BLOCKER' (uppercase)", () => {
		const entry = NOTIFICATION_TYPES.find((t) => t.key === "blocker_alert");
		expect(entry).toBeDefined();
		expect((entry as NotificationType & { shortLabel: string }).shortLabel).toBe("BLOCKER");
	});

	it("shortLabel values are uppercase so CSS-only uppercasing preserves DOM textContent match", () => {
		// Decision 1a casing contract: label path renders verbatim into DOM;
		// CSS uppercase class provides visual casing.
		// So the shortLabel must already be uppercase for getByText("REVIEW") to pass.
		for (const entry of NOTIFICATION_TYPES) {
			const label = (entry as NotificationType & { shortLabel: string }).shortLabel;
			expect(label).toBe(label.toUpperCase());
		}
	});
});

describe("shortLabelForType (AI4 Decision 4)", () => {
	it("is exported as a function", () => {
		expect(typeof shortLabelForType).toBe("function");
	});

	it("returns 'REVIEW' for review_request", () => {
		expect(shortLabelForType("review_request")).toBe("REVIEW");
	});

	it("returns 'BLOCKER' for blocker_alert", () => {
		expect(shortLabelForType("blocker_alert")).toBe("BLOCKER");
	});

	it("returns the shortLabel for all known keys", () => {
		const keys: NotificationTypeKey[] = ["review_request", "blocker_alert"];
		for (const key of keys) {
			const result = shortLabelForType(key);
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		}
	});
});
