/**
 * `applyFactoryCoreState`, core-api's own first-boot state, plants
 * `system:propagation` before anything else runs — every FK a `changes`/
 * `threads` row takes on it (lifecycle propagation's ship-confirmation
 * review, proven end to end in lifecycle-propagation.integration.test.ts)
 * depends on this row already existing.
 */

import { users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { applyFactoryCoreState } from "../bootstrap/factory-state.js";

describe("system:propagation is present after bootstrap", () => {
	test("system:propagation user exists after applyFactoryCoreState", async ({ db }) => {
		await applyFactoryCoreState(db);

		const [row] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, "system:propagation"))
			.limit(1);

		expect(row?.id).toBe("system:propagation");
	});
});
