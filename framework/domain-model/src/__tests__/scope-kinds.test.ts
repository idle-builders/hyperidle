/**
 * Scope is closed to three concentric rings: factory > team > user — a document's knowledge
 * scope, never a layer/product/practice/task costume. Only `team` requires a scope id.
 */

import { describe, expect, it } from "vitest";
import { SCOPE_KINDS, SCOPES_REQUIRING_ID } from "../types.js";

describe("SCOPE_KINDS", () => {
	it("is exactly {factory, team, user}", () => {
		expect([...SCOPE_KINDS].sort()).toEqual(["factory", "team", "user"]);
	});

	it("SCOPES_REQUIRING_ID is exactly {team}", () => {
		expect([...SCOPES_REQUIRING_ID]).toEqual(["team"]);
	});
});
