import type { KnowledgeItem } from "@hyperidle/db";
import { describe, expect, it } from "vitest";
import {
	type ContextAssemblyPorts,
	assemble,
} from "./assemble.js";

function fakeItem(id: string, title: string): KnowledgeItem {
	return {
		id,
		scopeKind: "team",
		scopeId: "t1",
		topic: null,
		title,
		body: "body",
		format: "md",
		status: "active",
		version: 1,
		updatedBy: "u1",
		createdAt: "2026-07-13T00:00:00Z",
		updatedAt: "2026-07-13T00:00:00Z",
	};
}

/** Proves Mechanism C: assemble composes injected ports with zero Service import. */
describe("context-assembly assemble() DI composition", () => {
	it("threads every port's output into the bundle", async () => {
		const ports: ContextAssemblyPorts = {
			knowledge: { list: async () => [fakeItem("k1", "Onboarding")] },
			work: { openBets: async () => ["bet-1", "bet-2"] },
			users: { displayName: async () => "Ada" },
			routine: { activeRoutines: async () => ["daily-digest"] },
			filesystems: { mountedPaths: async () => ["/repo"] },
		};

		const bundle = await assemble(ports, { scopeKind: "team", scopeId: "t1" }, "u1");

		expect(bundle.knowledge.map((k) => k.title)).toEqual(["Onboarding"]);
		expect(bundle.openBets).toEqual(["bet-1", "bet-2"]);
		expect(bundle.authorDisplayName).toBe("Ada");
		expect(bundle.activeRoutines).toEqual(["daily-digest"]);
		expect(bundle.mountedPaths).toEqual(["/repo"]);
	});
});
