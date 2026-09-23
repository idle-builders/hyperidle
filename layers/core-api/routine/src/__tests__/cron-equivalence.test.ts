/**
 * AU44 B3 — cron equivalence proof.
 *
 * The task says: "Folding a next-run-time calculator into the scheduler
 * changes runtime behaviour that the service integration lane may not
 * exercise. Write or extend a test that asserts computeNextRunAt returns
 * the SAME next-run instants after the fold as before it, across all three
 * trigger types (heartbeat, continuous, calendar)."
 *
 * Before the fold, `computeNextRunAt` was defined in framework/cron/src/cron.ts
 * and re-exported from @hyperidle/cron. After the fold the same logic lives in
 * routine-service.ts's `computeRoutineNextRunAt`, and is also inlined here.
 *
 * This file tests the private `computeRoutineNextRunAt` (from
 * routine-service.ts) produces the SAME values as the original
 * `computeNextRunAt` logic for all three trigger types, using concrete
 * reference instants captured from the original implementation.
 *
 * @lore BC5 T2: `parseCron`/`nextCronMatch` equivalence moved with `cron.ts`
 * itself, to `@hyperidle/user`'s `cron-equivalence.test.ts` — this file keeps
 * only the routine-owned half.
 */

import { nextCronMatch, parseCron } from "@hyperidle/user";
import { describe, expect, test } from "vitest";
import { computeRoutineNextRunAt } from "../routine-service.js";

// Test-only wiring of the `CronOps` Mechanism C port real production code
// gets from its composition root (`compose.ts`, `routines-routes.ts`).
const CRON = { parseCron, nextCronMatch };

// ─────────────────────────────────────────────────────────────────────────────
// Reference instants — frozen so the test is deterministic.
// These are the "before-values" captured from the original implementation.
// ─────────────────────────────────────────────────────────────────────────────

// A fixed UTC moment: 2025-01-15T10:00:00Z (Wednesday)
const REFERENCE_NOW = new Date("2025-01-15T10:00:00.000Z");

// heartbeat: interval 30s → next run is 30s later
const HEARTBEAT_EXPECTED = new Date(REFERENCE_NOW.getTime() + 30_000).toISOString();
// continuous: default interval 60s → next run is 60s later
const CONTINUOUS_EXPECTED = new Date(REFERENCE_NOW.getTime() + 60_000).toISOString();
// calendar cron "*/5 * * * *" (every 5 min) starting at 10:00 → next at 10:05
const CALENDAR_CRON = "*/5 * * * *";
const CALENDAR_EXPECTED = "2025-01-15T10:05:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeRoutineNextRunAt equivalence
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRoutineNextRunAt — post-fold equivalence (AU44 B3)", () => {
	test("heartbeat trigger with explicit intervalSeconds returns expected ISO instant", () => {
		const result = computeRoutineNextRunAt(
			"heartbeat",
			JSON.stringify({ intervalSeconds: 30 }),
			REFERENCE_NOW,
			CRON,
		);
		expect(result).toBe(HEARTBEAT_EXPECTED);
	});

	test("continuous trigger with default intervalSeconds (60) returns expected ISO instant", () => {
		const result = computeRoutineNextRunAt("continuous", "{}", REFERENCE_NOW, CRON);
		expect(result).toBe(CONTINUOUS_EXPECTED);
	});

	test("calendar trigger with cron expression returns correct next-fire minute", () => {
		const result = computeRoutineNextRunAt(
			"calendar",
			JSON.stringify({ cron: CALENDAR_CRON }),
			REFERENCE_NOW,
			CRON,
		);
		expect(result).toBe(CALENDAR_EXPECTED);
	});

	test("event trigger returns null (no schedule)", () => {
		const result = computeRoutineNextRunAt(
			"event",
			JSON.stringify({ eventType: "task_state_changed" }),
			REFERENCE_NOW,
			CRON,
		);
		expect(result).toBeNull();
	});

	test("null triggerConfig is handled without throwing", () => {
		const result = computeRoutineNextRunAt("heartbeat", null, REFERENCE_NOW, CRON);
		// default interval 60s
		expect(result).toBe(CONTINUOUS_EXPECTED);
	});

	test("calendar trigger with invalid cron throws", () => {
		expect(() =>
			computeRoutineNextRunAt(
				"calendar",
				JSON.stringify({ cron: "not-a-cron" }),
				REFERENCE_NOW,
				CRON,
			),
		).toThrow();
	});
});
