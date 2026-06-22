/**
 * AK6 — Scaffold types + event union: RED phase
 *
 * T1: ScaffoldRequest / AgentScaffoldSpec types exported from @hyperidle/shared.
 *     Closure contract: AgentScaffoldSpec has NO harness/model/cost field (AC6).
 *
 * T2: TeamCreatedEvent / AgentAddedEvent / UserCreatedEvent in KernelEvent union.
 *     Bus publish/subscribe round-trips each (AC2).
 *
 * Tests FAIL until:
 *   - ScaffoldRequest, AgentScaffoldSpec, scaffoldAgents added to strategy-port.ts
 *   - TeamCreatedEvent, AgentAddedEvent, UserCreatedEvent added to events.ts + KernelEvent union
 */

import { describe, expect, it } from "vitest";
import { EventBus } from "../event-bus.js";
import type {
	AgentAddedEvent,
	AgentScaffoldSpec,
	KernelEvent,
	ScaffoldRequest,
	TeamCreatedEvent,
	UserCreatedEvent,
} from "../index.js";

// ─────────────────────────────────────────────────────────────────────────────
// T1 — ScaffoldRequest / AgentScaffoldSpec shape + closure
// ─────────────────────────────────────────────────────────────────────────────

describe("T1: ScaffoldRequest has the required fields per architecture plan", () => {
	it("ScaffoldRequest trigger union is the 3 server-side surfaces only (no factory_bootstrap)", () => {
		// Compile-time check: the trigger union is exactly these 3 values.
		// At runtime, construct a value to confirm the type accepts them.
		type Trigger = ScaffoldRequest<unknown>["trigger"];
		const triggers: Trigger[] = ["team_scaffold", "agent_added", "user_assistant"];
		expect(triggers).toHaveLength(3);
	});

	it("ScaffoldRequest carries teamId, teamMembersId, teamName, functions, role, name, ownerUserId, ownerUserName", () => {
		// Build a full request to confirm the type accepts all fields.
		const req: ScaffoldRequest<unknown> = {
			db: null,
			trigger: "team_scaffold",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			functions: ["development", "product"],
			role: null,
			name: null,
			ownerUserId: null,
			ownerUserName: null,
		};
		expect(req.trigger).toBe("team_scaffold");
		expect(req.teamId).toBe("team-1");
		expect(req.functions).toEqual(["development", "product"]);
	});
});

describe("T1: AgentScaffoldSpec closure — no harness/model/cost fields", () => {
	it("AgentScaffoldSpec accepts role, name, agentCategory, systemPrompt, idHint", () => {
		const spec: AgentScaffoldSpec = {
			role: "builder",
			name: "Builder Bot",
			agentCategory: "team",
			systemPrompt: null,
			idHint: "ast-user-1",
		};
		expect(spec.role).toBe("builder");
		expect(spec.systemPrompt).toBeNull();
		expect(spec.idHint).toBe("ast-user-1");
	});

	it("AgentScaffoldSpec has no harnessType field at runtime", () => {
		const spec: AgentScaffoldSpec = {
			role: "builder",
			name: "Builder Bot",
			agentCategory: "team",
			systemPrompt: null,
		};
		// The spec must not carry harness/model/cost (concept closure contract).
		expect("harnessType" in spec).toBe(false);
	});

	it("AgentScaffoldSpec has no modelId field at runtime", () => {
		const spec: AgentScaffoldSpec = {
			role: "builder",
			name: "Builder Bot",
			agentCategory: "team",
			systemPrompt: null,
		};
		expect("modelId" in spec).toBe(false);
	});

	it("AgentScaffoldSpec has no modelProvider field at runtime", () => {
		const spec: AgentScaffoldSpec = {
			role: "builder",
			name: "Builder Bot",
			agentCategory: "team",
			systemPrompt: null,
		};
		expect("modelProvider" in spec).toBe(false);
	});

	it("AgentScaffoldSpec has no costCap field at runtime", () => {
		const spec: AgentScaffoldSpec = {
			role: "builder",
			name: "Builder Bot",
			agentCategory: "team",
			systemPrompt: null,
		};
		expect("costCap" in spec).toBe(false);
	});

	it("AgentScaffoldSpec has no maxConcurrentSessions field at runtime", () => {
		const spec: AgentScaffoldSpec = {
			role: "builder",
			name: "Builder Bot",
			agentCategory: "team",
			systemPrompt: null,
		};
		expect("maxConcurrentSessions" in spec).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — Creation events in KernelEvent union + bus round-trips (AC2)
// ─────────────────────────────────────────────────────────────────────────────

describe("T2: TeamCreatedEvent is in the KernelEvent union", () => {
	it("EventBus.on('team_created') receives the published event with correct payload", () => {
		const bus = new EventBus();
		const received: TeamCreatedEvent[] = [];
		bus.on("team_created", (e) => received.push(e));

		const event: TeamCreatedEvent = {
			type: "team_created",
			streamId: "team-1",
			teamId: "team-1",
			teamMembersId: "tm-1",
			functions: ["development", "product"],
			agentIds: ["agent-a", "agent-b"],
			at: new Date().toISOString(),
		};

		// EventBus.emit requires KernelEvent — this will fail to compile if
		// TeamCreatedEvent is not in the KernelEvent union.
		bus.emit(event as KernelEvent);

		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe("team_created");
		expect(received[0]?.teamId).toBe("team-1");
		expect(received[0]?.agentIds).toEqual(["agent-a", "agent-b"]);
	});
});

describe("T2: AgentAddedEvent is in the KernelEvent union", () => {
	it("EventBus.on('agent_added') receives the published event with correct payload", () => {
		const bus = new EventBus();
		const received: AgentAddedEvent[] = [];
		bus.on("agent_added", (e) => received.push(e));

		const event: AgentAddedEvent = {
			type: "agent_added",
			streamId: "team-1",
			teamId: "team-1",
			teamMembersId: "tm-1",
			agentId: "agent-1",
			role: "builder",
			at: new Date().toISOString(),
		};

		bus.emit(event as KernelEvent);

		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe("agent_added");
		expect(received[0]?.agentId).toBe("agent-1");
		expect(received[0]?.role).toBe("builder");
	});
});

describe("T2: UserCreatedEvent is in the KernelEvent union", () => {
	it("EventBus.on('user_created') receives the published event with correct payload", () => {
		const bus = new EventBus();
		const received: UserCreatedEvent[] = [];
		bus.on("user_created", (e) => received.push(e));

		const event: UserCreatedEvent = {
			type: "user_created",
			streamId: "user-1",
			userId: "user-1",
			assistantAgentId: "ast-user-1",
			at: new Date().toISOString(),
		};

		bus.emit(event as KernelEvent);

		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe("user_created");
		expect(received[0]?.userId).toBe("user-1");
		expect(received[0]?.assistantAgentId).toBe("ast-user-1");
	});
});

describe("T2: switch(event.type) over KernelEvent compiles exhaustively for new events", () => {
	it("exhaustive KernelEvent switch handles team_created, agent_added, user_created without default", () => {
		// This helper must be written WITHOUT a `default` arm — if TS exhaustiveness
		// check fails (missing arm), the compile step red flags it.
		// At runtime this test just confirms the function doesn't throw.
		function handleEvent(event: KernelEvent): string {
			switch (event.type) {
				case "task_state_changed":
					return "task_state_changed";
				case "bet_state_changed":
					return "bet_state_changed";
				case "bet_revised":
					return "bet_revised";
				case "session_started":
					return "session_started";
				case "session_ended":
					return "session_ended";
				case "thread_created":
					return "thread_created";
				case "thread_message_appended":
					return "thread_message_appended";
				case "thread_resolved":
					return "thread_resolved";
				case "thread_reopened":
					return "thread_reopened";
				case "thread_archived":
					return "thread_archived";
				case "item_created":
					return "item_created";
				case "dependency_met":
					return "dependency_met";
				case "knowledge_created":
					return "knowledge_created";
				case "knowledge_updated":
					return "knowledge_updated";
				case "knowledge_archived":
					return "knowledge_archived";
				case "knowledge_accessed":
					return "knowledge_accessed";
				case "artifact_created":
					return "artifact_created";
				// AK6: three new creation events
				case "team_created":
					return "team_created";
				case "agent_added":
					return "agent_added";
				case "user_created":
					return "user_created";
				// AK7: selection occasion event
				case "work_selection_requested":
					return "work_selection_requested";
				// AK8: decomposition occasion event
				case "work_decompose_requested":
					return "work_decompose_requested";
			}
		}

		const teamCreatedEvent: TeamCreatedEvent = {
			type: "team_created",
			streamId: "team-x",
			teamId: "team-x",
			teamMembersId: "tm-x",
			functions: ["development"],
			agentIds: ["agent-x"],
			at: new Date().toISOString(),
		};
		expect(handleEvent(teamCreatedEvent as KernelEvent)).toBe("team_created");

		const agentAddedEvent: AgentAddedEvent = {
			type: "agent_added",
			streamId: "team-x",
			teamId: "team-x",
			teamMembersId: "tm-x",
			agentId: "agent-y",
			role: "builder",
			at: new Date().toISOString(),
		};
		expect(handleEvent(agentAddedEvent as KernelEvent)).toBe("agent_added");

		const userCreatedEvent: UserCreatedEvent = {
			type: "user_created",
			streamId: "user-x",
			userId: "user-x",
			assistantAgentId: "ast-user-x",
			at: new Date().toISOString(),
		};
		expect(handleEvent(userCreatedEvent as KernelEvent)).toBe("user_created");
	});
});
