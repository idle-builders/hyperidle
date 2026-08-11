/**
 * AU36 RED — InheritedConnectionFact shape pin. TRANSLATION of the AN1 pin
 * `AN1-descriptor-inherited-tools.test.ts` (which pinned the since-deleted
 * `HarnessCapabilityDescriptor.inheritedTools` field) onto the fact's new home
 * (architecture.md §7.1 item 4, §8 step 1, D2).
 *
 * Like the AN1 pin it translates, this is a TYPE-shape pin: the runtime
 * assertions guard the constructed literals, and the honest red is `tsc`
 * failing on the missing `InheritedConnectionFact` export until D2 lands in
 * `framework/domain-model/src/connection.ts`.
 *
 * AC coverage:
 *   AC1 — reach has its own identity in the domain model, off the harness
 *         descriptor (the field rename harness→source is the provenance string,
 *         not a harness dependency — requirements §2.1)
 *   AC4 — identity-only invariant re-pinned at the type level: no secret,
 *         token, env, or command field may ever appear (AN1 hard-rule 4)
 *
 * FAILS until framework/domain-model/src/connection.ts exports
 * InheritedConnectionFact (D2).
 */

import { describe, expect, it } from "vitest";
import type { ConnectionHealth, InheritedConnectionFact } from "../connection.js";

describe("AU36 — InheritedConnectionFact shape (identity only, no secret)", () => {
	it("includes name, kind, source, health", () => {
		const fact: InheritedConnectionFact = {
			name: "github",
			kind: "mcp-server",
			source: "claude-code",
			health: "working",
		};

		expect(fact.name).toBe("github");
		expect(fact.kind).toBe("mcp-server");
		expect(fact.source).toBe("claude-code");
		expect(fact.health).toBe("working");
	});

	it("kind is 'mcp-server' or 'cli'", () => {
		const mcpFact: InheritedConnectionFact = {
			name: "linear",
			kind: "mcp-server",
			source: "claude-code",
			health: "working",
		};
		const cliFact: InheritedConnectionFact = {
			name: "gh",
			kind: "cli",
			source: "environment",
			health: "working",
		};

		expect(mcpFact.kind).toBe("mcp-server");
		expect(cliFact.kind).toBe("cli");
	});

	it("has NO secret, env, command, or token field (AN1 hard-rule 4)", () => {
		const fact: InheritedConnectionFact = {
			name: "stripe",
			kind: "cli",
			source: "environment",
			health: "unknown",
		};

		expect(fact).not.toHaveProperty("secret");
		expect(fact).not.toHaveProperty("token");
		expect(fact).not.toHaveProperty("env");
		expect(fact).not.toHaveProperty("command");
	});

	it("health is ConnectionHealth | 'unknown'", () => {
		const working: InheritedConnectionFact = {
			name: "github",
			kind: "cli",
			source: "environment",
			health: "working" satisfies ConnectionHealth | "unknown",
		};
		const needsAttention: InheritedConnectionFact = {
			name: "github",
			kind: "mcp-server",
			source: "codex",
			health: "needs-attention" satisfies ConnectionHealth | "unknown",
		};
		const unknown: InheritedConnectionFact = {
			name: "linear",
			kind: "mcp-server",
			source: "opencode",
			health: "unknown",
		};

		expect(working.health).toBe("working");
		expect(needsAttention.health).toBe("needs-attention");
		expect(unknown.health).toBe("unknown");
	});

	it("source is a plain provenance string — the unchanged AN1 values stay expressible (D2)", () => {
		const sources = ["claude-code", "codex", "opencode", "environment"] as const;
		const facts: InheritedConnectionFact[] = sources.map((source) => ({
			name: "github",
			kind: "mcp-server",
			source,
			health: "unknown",
		}));

		expect(facts.map((fact) => fact.source)).toEqual([...sources]);
	});
});
