/**
 * AU44 B3 — cron equivalence proof, the `parseCron`/`nextCronMatch` half.
 *
 * Before the fold, this logic lived in framework/cron/src/cron.ts and was
 * re-exported from @hyperidle/cron; this file asserts it still produces the
 * same outputs as the original implementation.
 *
 * @lore BC5 T2: lives here with `cron.ts` itself — the subscription clock is
 * this module's own caller now.
 */

import { describe, expect, test } from "vitest";
import { nextCronMatch, parseCron } from "../cron.js";

// A fixed UTC moment: 2025-01-15T10:00:00Z (Wednesday)
const REFERENCE_NOW = new Date("2025-01-15T10:00:00.000Z");

// calendar cron "*/5 * * * *" (every 5 min) starting at 10:00 → next at 10:05
const CALENDAR_CRON = "*/5 * * * *";
const CALENDAR_EXPECTED = "2025-01-15T10:05:00.000Z";

describe("parseCron / nextCronMatch — @hyperidle/user's cron module (AU44 B3)", () => {
	test("parseCron produces correct CronFields for '*/5 * * * *'", () => {
		const fields = parseCron("*/5 * * * *");
		expect(fields.minute).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
		expect(fields.hour).toBe("*");
		expect(fields.dayOfMonth).toBe("*");
		expect(fields.month).toBe("*");
		expect(fields.dayOfWeek).toBe("*");
	});

	test("nextCronMatch advances to the correct minute", () => {
		const fields = parseCron(CALENDAR_CRON);
		const next = nextCronMatch(fields, REFERENCE_NOW);
		expect(next.toISOString()).toBe(CALENDAR_EXPECTED);
	});

	test("nextCronMatch — daily cron '0 9 * * *' next fire from 10:00 is next day 09:00", () => {
		const fields = parseCron("0 9 * * *");
		const next = nextCronMatch(fields, REFERENCE_NOW);
		// 10:00 UTC Jan 15 → next 09:00 UTC is Jan 16
		expect(next.toISOString()).toBe("2025-01-16T09:00:00.000Z");
	});

	test("nextCronMatch — weekly cron '0 10 * * MON' next fire from Wednesday is next Monday", () => {
		const fields = parseCron("0 10 * * MON");
		const next = nextCronMatch(fields, REFERENCE_NOW);
		// Jan 15 2025 is Wednesday → next Monday is Jan 20
		expect(next.toISOString()).toBe("2025-01-20T10:00:00.000Z");
	});

	test("parseCron throws on invalid expression", () => {
		expect(() => parseCron("not valid cron")).toThrow();
		expect(() => parseCron("* * * *")).toThrow(); // only 4 fields
	});
});
