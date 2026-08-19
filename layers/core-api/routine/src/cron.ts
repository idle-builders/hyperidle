/**
 * Pure cron utilities — private to the @hyperidle/routine package.
 *
 * AU44 batch 3: dissolved from framework/cron. Calendar routines are
 * routine-domain logic; the only real consumer was the routine scheduler.
 * Not exported from the package index — callers outside this package
 * do not need cron access after the nextRunAt computation moved inside
 * insertRoutine.
 *
 * @lore AU44 B3: computeNextRunAt merged into computeRoutineNextRunAt in
 * routine-service.ts (single canonical next-run-at function, returns null for
 * event triggers rather than ""). parseCron/nextCronMatch stay as private
 * helpers here. CronFields is an internal type.
 */

export interface CronFields {
	minute: number[] | "*";
	hour: number[] | "*";
	dayOfMonth: number[] | "*";
	month: number[] | "*";
	dayOfWeek: number[] | "*";
}

const DAY_NAMES: Record<string, number> = {
	SUN: 0,
	MON: 1,
	TUE: 2,
	WED: 3,
	THU: 4,
	FRI: 5,
	SAT: 6,
};

function parseField(field: string, min: number, max: number): number[] | "*" {
	if (field === "*") return "*";

	const values: number[] = [];
	const parts = field.split(",");

	for (const part of parts) {
		const upper = part.toUpperCase();
		if (DAY_NAMES[upper] !== undefined) {
			// biome-ignore lint/style/noNonNullAssertion: DAY_NAMES[upper] is defined (checked above)
			values.push(DAY_NAMES[upper]!);
			continue;
		}

		if (part.includes("-")) {
			const rangeParts = part.split("-");
			const startStr = rangeParts[0];
			const endStr = rangeParts[1];
			if (startStr === undefined || endStr === undefined) {
				throw new Error(`Invalid cron range: ${part}`);
			}
			const start = Number.parseInt(startStr, 10);
			const end = Number.parseInt(endStr, 10);
			if (Number.isNaN(start) || Number.isNaN(end) || start < min || end > max) {
				throw new Error(`Invalid cron range: ${part}`);
			}
			for (let i = start; i <= end; i++) {
				values.push(i);
			}
			continue;
		}

		if (part.startsWith("*/")) {
			const step = Number.parseInt(part.slice(2), 10);
			if (Number.isNaN(step) || step <= 0) {
				throw new Error(`Invalid cron step: ${part}`);
			}
			for (let i = min; i <= max; i += step) {
				values.push(i);
			}
			continue;
		}

		const num = Number.parseInt(part, 10);
		if (Number.isNaN(num) || num < min || num > max) {
			throw new Error(`Invalid cron field value: ${part}`);
		}
		values.push(num);
	}

	return values;
}

function fieldMatches(field: number[] | "*", value: number): boolean {
	if (field === "*") return true;
	return field.includes(value);
}

/**
 * Parse a 5-field cron expression into an opaque parsed form.
 * Throws on invalid input (callers should catch and return INVALID_INPUT).
 */
export function parseCron(expr: string): CronFields {
	const parts = expr.trim().split(/\s+/);
	if (parts.length !== 5) {
		throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
	}

	const [p0, p1, p2, p3, p4] = parts;
	if (
		p0 === undefined ||
		p1 === undefined ||
		p2 === undefined ||
		p3 === undefined ||
		p4 === undefined
	) {
		throw new Error(`Invalid cron expression: expected 5 fields`);
	}

	return {
		minute: parseField(p0, 0, 59),
		hour: parseField(p1, 0, 23),
		dayOfMonth: parseField(p2, 1, 31),
		month: parseField(p3, 1, 12),
		dayOfWeek: parseField(p4, 0, 6),
	} satisfies CronFields;
}

/**
 * Find the next calendar moment (rounded to the minute) that matches the
 * parsed cron expression, starting strictly after `from`.
 */
export function nextCronMatch(cron: CronFields, from: Date): Date {
	const candidate = new Date(from.getTime());
	candidate.setUTCSeconds(0, 0);
	candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

	const maxIterations = 400 * 24 * 60;
	for (let i = 0; i < maxIterations; i++) {
		if (
			fieldMatches(cron.month, candidate.getUTCMonth() + 1) &&
			fieldMatches(cron.dayOfMonth, candidate.getUTCDate()) &&
			fieldMatches(cron.dayOfWeek, candidate.getUTCDay()) &&
			fieldMatches(cron.hour, candidate.getUTCHours()) &&
			fieldMatches(cron.minute, candidate.getUTCMinutes())
		) {
			return candidate;
		}
		candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
	}

	throw new Error("No cron match found within 400 days");
}
