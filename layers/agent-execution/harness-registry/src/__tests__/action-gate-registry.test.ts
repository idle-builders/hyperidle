/**
 * Unit tests for the action gate registry.
 *
 * Tests register/get/setPendingBlock/clearPendingBlock/addClearance/
 * checkAndConsumeClearance/setNativeSessionId/unregister operations.
 */

import { describe, expect, it } from "vitest";
import { createActionGateRegistry } from "../action-gate-registry.js";

const rules = [
	{ id: "r1", pattern: "bash", description: "Shell commands" },
	{ id: "r2", pattern: "write_file", description: "File writes" },
] as const;

describe("ActionGateRegistry", () => {
	it("returns undefined for unregistered session", () => {
		const reg = createActionGateRegistry();
		expect(reg.get("no-such")).toBeUndefined();
	});

	it("registers a session and returns its entry", () => {
		const reg = createActionGateRegistry();
		reg.register("s1", { rules, sandboxPath: "/tmp/s1" });
		const entry = reg.get("s1");
		expect(entry).toBeDefined();
		expect(entry?.rules).toEqual(rules);
		expect(entry?.sandboxPath).toBe("/tmp/s1");
		expect(entry?.pendingBlock).toBeNull();
		expect(entry?.nativeSessionId).toBeNull();
	});

	it("overwrites on re-register (session restart)", () => {
		const reg = createActionGateRegistry();
		reg.register("s1", { rules, sandboxPath: "/tmp/s1" });
		reg.setPendingBlock("s1", { ruleId: "r1", rulePattern: "bash", blockedTool: "bash" });
		// re-register clears old state
		reg.register("s1", { rules: [], sandboxPath: "/tmp/s1-new" });
		const entry = reg.get("s1");
		expect(entry?.rules).toHaveLength(0);
		expect(entry?.sandboxPath).toBe("/tmp/s1-new");
		expect(entry?.pendingBlock).toBeNull();
	});

	it("setPendingBlock records the block", () => {
		const reg = createActionGateRegistry();
		reg.register("s1", { rules, sandboxPath: "/tmp" });
		reg.setPendingBlock("s1", { ruleId: "r1", rulePattern: "bash", blockedTool: "bash" });
		expect(reg.get("s1")?.pendingBlock).toEqual({
			ruleId: "r1",
			rulePattern: "bash",
			blockedTool: "bash",
		});
	});

	it("clearPendingBlock removes the block", () => {
		const reg = createActionGateRegistry();
		reg.register("s1", { rules, sandboxPath: "/tmp" });
		reg.setPendingBlock("s1", { ruleId: "r1", rulePattern: "bash", blockedTool: "bash" });
		reg.clearPendingBlock("s1");
		expect(reg.get("s1")?.pendingBlock).toBeNull();
	});

	it("addClearance makes checkAndConsumeClearance return true once", () => {
		const reg = createActionGateRegistry();
		reg.register("s1", { rules, sandboxPath: "/tmp" });
		reg.addClearance("s1", "bash");

		expect(reg.checkAndConsumeClearance("s1", "bash")).toBe(true);
		// second call: clearance was consumed
		expect(reg.checkAndConsumeClearance("s1", "bash")).toBe(false);
	});

	it("clearance is tool-name specific — other tools are not cleared", () => {
		const reg = createActionGateRegistry();
		reg.register("s1", { rules, sandboxPath: "/tmp" });
		reg.addClearance("s1", "bash");
		expect(reg.checkAndConsumeClearance("s1", "write_file")).toBe(false);
		// the bash clearance is still present (not consumed by wrong key)
		expect(reg.checkAndConsumeClearance("s1", "bash")).toBe(true);
	});

	it("checkAndConsumeClearance returns false for unregistered session", () => {
		const reg = createActionGateRegistry();
		expect(reg.checkAndConsumeClearance("no-such", "bash")).toBe(false);
	});

	it("setNativeSessionId persists the native ID", () => {
		const reg = createActionGateRegistry();
		reg.register("s1", { rules, sandboxPath: "/tmp" });
		reg.setNativeSessionId("s1", "native-abc-123");
		expect(reg.get("s1")?.nativeSessionId).toBe("native-abc-123");
	});

	it("unregister removes the entry", () => {
		const reg = createActionGateRegistry();
		reg.register("s1", { rules, sandboxPath: "/tmp" });
		reg.unregister("s1");
		expect(reg.get("s1")).toBeUndefined();
	});

	it("unregister is a no-op for unknown session", () => {
		const reg = createActionGateRegistry();
		expect(() => reg.unregister("no-such")).not.toThrow();
	});
});
