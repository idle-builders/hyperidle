/**
 * Pins the stable DB ids minted by skillItemId, agentItemId, and
 * subscriptionItemId for team-scoped installs. These ids are stored in the
 * DB and must not change — a churn would create duplicates on reinstall.
 */

import { describe, expect, test } from "vitest";
import { skillItemId } from "../plugin-installer.js";

describe("skillItemId: team-scoped id is stable", () => {
	test("known inputs produce the same id before and after removing the dead non-team branch", () => {
		// Pin the exact bytes: any change to the hash input or prefix breaks reinstall id match.
		expect(skillItemId("plugin-x", "my-dir", "team", "team-123")).toBe(
			"ki_0c66ff1819423ebc1b5aefd9",
		);
	});
});
