/**
 * AF8 — Notification type registry (AC8 unit tests)
 *
 * Tests:
 *   - NOTIFICATION_TYPES registry shape: { key, label, description, defaultUrgency }
 *   - urgencyForType returns correct defaults and falls back to "ambient"
 *   - Registry covers review_request, blocker_alert
 *   - NotificationTypeKey is a closed discriminated union
 *
 * @lore AU21 Increment 14a: `cost_alert` is HARD-DELETED along with the rest
 * of the cost-cap feature — no replacement notification type.
 */

import { describe, expect, it } from "vitest";
import {
	NOTIFICATION_TYPES,
	type NotificationType,
	type NotificationTypeKey,
	type NotificationUrgency,
	urgencyForType,
} from "../notifications.js";

describe("AF8 — notification type registry (AC8)", () => {
	it("exports NOTIFICATION_TYPES as a readonly array", () => {
		expect(Array.isArray(NOTIFICATION_TYPES)).toBe(true);
		expect(NOTIFICATION_TYPES.length).toBeGreaterThan(0);
	});

	it("every entry has key, label, description, defaultUrgency", () => {
		for (const entry of NOTIFICATION_TYPES) {
			expect(typeof entry.key).toBe("string");
			expect(entry.key.length).toBeGreaterThan(0);
			expect(typeof entry.label).toBe("string");
			expect(entry.label.length).toBeGreaterThan(0);
			expect(typeof entry.description).toBe("string");
			expect(entry.description.length).toBeGreaterThan(0);
			expect(["immediate", "ambient"]).toContain(entry.defaultUrgency);
		}
	});

	it("registry contains review_request, blocker_alert", () => {
		const keys = NOTIFICATION_TYPES.map((t) => t.key);
		expect(keys).toContain("review_request");
		expect(keys).toContain("blocker_alert");
	});

	it("review_request has defaultUrgency=immediate", () => {
		const entry = NOTIFICATION_TYPES.find((t) => t.key === "review_request");
		expect(entry).toBeDefined();
		expect(entry!.defaultUrgency).toBe("immediate");
	});

	it("blocker_alert has defaultUrgency=immediate", () => {
		const entry = NOTIFICATION_TYPES.find((t) => t.key === "blocker_alert");
		expect(entry).toBeDefined();
		expect(entry!.defaultUrgency).toBe("immediate");
	});

	it("urgencyForType returns the registry default for known keys", () => {
		expect(urgencyForType("review_request")).toBe("immediate");
		expect(urgencyForType("blocker_alert")).toBe("immediate");
	});

	// Type-level: NotificationUrgency is closed
	it("NotificationUrgency is immediate or ambient only", () => {
		const validUrgencies: NotificationUrgency[] = ["immediate", "ambient"];
		for (const entry of NOTIFICATION_TYPES) {
			expect(validUrgencies).toContain(entry.defaultUrgency);
		}
	});

	// Structural conformance: all entries satisfy NotificationType interface
	it("entries satisfy NotificationType interface shape", () => {
		for (const entry of NOTIFICATION_TYPES) {
			const typed: NotificationType = entry;
			expect(typed.key).toBeDefined();
		}
	});
});

describe("AF8 — silence predicates (AC12)", () => {
	// These predicates are tested via the integration tests in the server package.
	// Here we only verify that the shared types and registry exports are correct
	// so the compile-time boundary is enforced.

	it("NotificationTypeKey type covers all registry entries", () => {
		// Every registered key must be assignable to NotificationTypeKey
		const keys: NotificationTypeKey[] = NOTIFICATION_TYPES.map((t) => t.key);
		expect(keys).toHaveLength(NOTIFICATION_TYPES.length);
	});
});
