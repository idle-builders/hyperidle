import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { describe, expect, test, vi } from "vitest";
import { runSession } from "../runtime.js";
import { buildTestPorts } from "./test-ports.js";

const input = {
	taskId: null,
	agentId: "agent-1",
	productId: "team-1",
	sandboxBasePath: "/tmp/au20-one-shot",
};

describe("runSession modes", () => {
	test("assemble returns context without claim, admission, or harness side effects", async () => {
		const ports = buildTestPorts();
		const claim = vi.spyOn(ports.sessionRequests, "claimSessionRequest");
		const contextPorts: import("../contracts.js").RuntimeDeps["composition"]["context"] = {
			filesystems: { startWatcher: vi.fn(() => ({ stop: vi.fn() })) },
		};
		const assembleInput: Extract<
			import("../contracts.js").RunOptions,
			{ mode: "assemble" }
		>["input"] = {
			sandboxPath: "/tmp/au20-assemble-mode",
			sessionId: "assemble-1",
			taskId: null,
			agentId: "agent-1",
			teamId: null,
			taskFree: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
		};
		const result = await runSession(
			{
				db: {} as HyperIdleDb,
				eventBus: new EventBus(),
				ports,
				composition: { context: contextPorts },
			},
			{ mode: "assemble", input: assembleInput },
		);

		expect(result).toMatchObject({ mode: "assembled", context: { itemCount: 0 } });
		expect(claim).not.toHaveBeenCalled();
		expect(ports.sessionProvisioner!.admitSession).not.toHaveBeenCalled();
		expect(ports.sessionProvisioner!.runSession).not.toHaveBeenCalled();
	});

	test("one-shot await admits and returns the complete harness outcome without a durable request", async () => {
		const ports = buildTestPorts();
		const claim = vi.spyOn(ports.sessionRequests, "claimSessionRequest");
		vi.mocked(ports.sessionProvisioner!.admitSession).mockResolvedValue({
			sessionId: "one-shot-1",
			sessionContext: { taskId: null },
		});
		vi.mocked(ports.sessionProvisioner!.runSession).mockResolvedValue({
			sessionId: "one-shot-1",
			outcome: "completed",
			taskId: null,
			forceReturnCount: 1,
		});

		const result = await runSession(
			{
				db: {} as HyperIdleDb,
				eventBus: new EventBus(),
				ports,
			} as unknown as import("../contracts.js").RuntimeDeps,
			{ mode: "one-shot", completion: "await", input },
		);

		expect(result).toMatchObject({ mode: "completed", sessionId: "one-shot-1" });
		expect(claim).not.toHaveBeenCalled();
	});

	test("one-shot admit returns after admission while harness completion remains detached", async () => {
		const ports = buildTestPorts();
		const claim = vi.spyOn(ports.sessionRequests, "claimSessionRequest");
		vi.mocked(ports.sessionProvisioner!.admitSession).mockResolvedValue({
			sessionId: "one-shot-2",
			sessionContext: { taskId: null },
		});
		vi.mocked(ports.sessionProvisioner!.runSession).mockReturnValue(new Promise(() => undefined));

		await expect(
			runSession(
				{
					db: {} as HyperIdleDb,
					eventBus: new EventBus(),
					ports,
				} as unknown as import("../contracts.js").RuntimeDeps,
				{ mode: "one-shot", completion: "admit", input },
			),
		).resolves.toEqual({ mode: "admitted", sessionId: "one-shot-2" });
		expect(ports.sessionProvisioner!.runSession).toHaveBeenCalledOnce();
		expect(claim).not.toHaveBeenCalled();
	});
});
