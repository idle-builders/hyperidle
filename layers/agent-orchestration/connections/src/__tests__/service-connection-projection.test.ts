/**
 * AU36 RED — ServiceConnectionProjection unit tests, retargeted from harness
 * descriptor fixtures to `InheritedConnectionFact` arrays (architecture.md
 * §7.1 / D6: signature becomes `(facts: readonly InheritedConnectionFact[]):
 * ServiceConnectionView[]`).
 *
 * Every assertion preserves the AN1 output contract verbatim (architecture §2
 * "Reused verbatim"): authSource:"inherited", removable:false,
 * id: inherited:<source>:<name>, via: "<source> · <name>", health
 * unknown→working / explicit needs-attention kept, first-wins dedup by name.
 *
 * AC coverage:
 *   AC1 — the projection reads reach facts only — no harness descriptor anywhere
 *   AC3 — the projected view shape/values are exactly today's contract
 *   AC4 — projected views carry identity only (no secret/token material)
 *
 * FAILS until:
 *   - framework/domain-model/src/connection.ts exports InheritedConnectionFact (D2)
 *   - service-connection-projection.ts flattens facts (input order, first-wins
 *     dedup by name) instead of descriptors[].inheritedTools
 */

import type { InheritedConnectionFact } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { projectInheritedConnections } from "../service-connection-projection.js";

/** Minimal fact builder — identity-only shape of D2. */
function makeFact(
	overrides: Partial<InheritedConnectionFact> & Pick<InheritedConnectionFact, "name">,
): InheritedConnectionFact {
	return {
		kind: "mcp-server",
		source: "claude-code",
		health: "working",
		...overrides,
	};
}

describe("projectInheritedConnections (over facts)", () => {
	// AC1/AC3: basic projection from facts
	describe("projection from reach facts", () => {
		it("returns a ServiceConnectionView for each fact", () => {
			const facts = [makeFact({ name: "github" }), makeFact({ name: "linear" })];

			const views = projectInheritedConnections(facts);

			expect(views).toHaveLength(2);
		});

		it("all projected views have authSource:'inherited'", () => {
			const views = projectInheritedConnections([makeFact({ name: "github" })]);
			for (const v of views) {
				expect(v.authSource).toBe("inherited");
			}
		});

		it("all projected views have removable:false (concept hard-rule 7)", () => {
			const views = projectInheritedConnections([
				makeFact({ name: "stripe", kind: "cli", source: "environment" }),
			]);
			for (const v of views) {
				expect(v.removable).toBe(false);
			}
		});

		it("projected view id is inherited:<source>:<name> (sentinel, not a DB id)", () => {
			const views = projectInheritedConnections([makeFact({ name: "github" })]);
			expect(views[0]?.id).toBe("inherited:claude-code:github");
		});

		it("projected view via is '<source> · <name>' (identity only)", () => {
			const views = projectInheritedConnections([makeFact({ name: "linear", source: "codex" })]);
			expect(views[0]?.via).toBe("codex · linear");
		});

		it("projected view carries no secret, no token, no encryptedToken field", () => {
			const views = projectInheritedConnections([
				makeFact({ name: "gh", kind: "cli", source: "environment" }),
			]);
			for (const v of views) {
				// AC4 / concept hard-rule 4: no auth material in projected view
				expect(v).not.toHaveProperty("secret");
				expect(v).not.toHaveProperty("token");
				expect(v).not.toHaveProperty("encryptedToken");
				expect(v).not.toHaveProperty("encrypted_token");
			}
		});
	});

	// Health display contract (architecture §2): unknown→working, explicit kept
	describe("health display contract", () => {
		it("health 'unknown' displays as 'working'", () => {
			const views = projectInheritedConnections([makeFact({ name: "github", health: "unknown" })]);
			expect(views[0]?.health).toBe("working");
		});

		it("explicit 'needs-attention' is preserved", () => {
			const views = projectInheritedConnections([
				makeFact({ name: "github", health: "needs-attention" }),
			]);
			expect(views[0]?.health).toBe("needs-attention");
		});
	});

	// AN3 scope: honest none-state when nothing inherited
	describe("empty input → no views", () => {
		it("returns empty array when the facts array is empty", () => {
			const views = projectInheritedConnections([]);
			expect(views).toHaveLength(0);
		});
	});

	// Dedup: same service from multiple sources → one row (first wins, input order)
	describe("deduplication across sources", () => {
		it("deduplicates by service name when the same service appears in multiple sources", () => {
			const facts = [
				makeFact({ name: "github", source: "claude-code" }),
				makeFact({ name: "github", source: "codex" }),
			];

			const views = projectInheritedConnections(facts);

			// First wins — dedupe by service name
			expect(views.filter((v) => v.service === "github")).toHaveLength(1);
			expect(views[0]?.id).toBe("inherited:claude-code:github");
		});
	});

	// Return shape: ServiceConnectionView fields
	describe("return type", () => {
		it("each view has the expected ServiceConnectionView fields", () => {
			const views = projectInheritedConnections([
				makeFact({ name: "stripe", kind: "cli", source: "environment" }),
			]);
			expect(views).toHaveLength(1);
			const v = views[0];
			expect(v).toHaveProperty("id");
			expect(v).toHaveProperty("service");
			expect(v).toHaveProperty("via");
			expect(v).toHaveProperty("authSource");
			expect(v).toHaveProperty("health");
			expect(v).toHaveProperty("removable");
		});
	});
});
