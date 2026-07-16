/**
 * AL7 RED — Proposed Call types + event union
 *
 * Tests FAIL until:
 *   - packages/shared/src/proposed-call.ts exports ProposedCall, ProposedCallStatus,
 *     PROPOSED_CALL_STATUSES, Reversibility, REVERSIBILITY
 *   - SessionWorkflow + SessionConfig.sessionWorkflow added to harness-adapter.ts
 *   - ProposedCallGrantedEvent added to events.ts + KernelEvent union
 *   - staged-operation.ts / StagedOperationSpec removed from shared index
 *
 * Covers: AC1 (Proposed Call shape), AC3 (event shape), AC10b (verbatim args),
 *         AC13 (verdict grammar unchanged — existing KernelEvent switch still compiles).
 */

import { describe, expect, it } from "vitest";
import { EventBus } from "../event-bus.js";
import type {
	KernelEvent,
	ProposedCall,
	ProposedCallGrantedEvent,
	ProposedCallStatus,
	Reversibility,
	SessionWorkflow,
} from "../index.js";

// ─────────────────────────────────────────────────────────────────────────────
// T1 — ProposedCallStatus constants and type
// ─────────────────────────────────────────────────────────────────────────────

describe("T1: ProposedCall status lifecycle", () => {
	it("PROPOSED_CALL_STATUSES contains exactly captured | granted | executed | failed | held", async () => {
		const { PROPOSED_CALL_STATUSES } = await import("../proposed-call.js");
		const statuses: readonly string[] = PROPOSED_CALL_STATUSES;
		expect(statuses).toContain("captured");
		expect(statuses).toContain("granted");
		expect(statuses).toContain("executed");
		expect(statuses).toContain("failed");
		expect(statuses).toContain("held");
		// No v1 statuses: pending / executing must not be present (AC12 — no kernel executor)
		expect(statuses).not.toContain("pending");
		expect(statuses).not.toContain("executing");
	});

	it("REVERSIBILITY contains exactly irreversible | reversible", async () => {
		const { REVERSIBILITY } = await import("../proposed-call.js");
		const rev: readonly string[] = REVERSIBILITY;
		expect(rev).toContain("irreversible");
		expect(rev).toContain("reversible");
		expect(rev).toHaveLength(2);
	});

	it("ProposedCall shape accepts all required fields", () => {
		// Compile-time check: the type must accept this shape.
		const call: ProposedCall = {
			id: "pc-1",
			reviewMessageId: "msg-1",
			subjectThreadId: "thread-1",
			artifactId: "art-1",
			originSessionId: "sess-1",
			toolId: "commit_file",
			args: { path: "/workspace/out.txt", content: "done" },
			identityHash: "sha256-abc",
			reversibility: "irreversible" as Reversibility,
			status: "captured" as ProposedCallStatus,
		};
		expect(call.toolId).toBe("commit_file");
		// verbatim args — AC10b: args is an object, not a summary string
		expect(typeof call.args).toBe("object");
		expect(call.args).not.toBeNull();
		expect(call.args.path).toBe("/workspace/out.txt");
	});

	it("ProposedCall has NO capabilityTool / operation / params / consequenceId / idempotencyKey (v1 model rejected)", () => {
		const call: ProposedCall = {
			id: "pc-2",
			reviewMessageId: "msg-2",
			subjectThreadId: "thread-2",
			artifactId: "art-2",
			originSessionId: "sess-2",
			toolId: "github_merge_pr",
			args: { pr: 42 },
			identityHash: "sha256-xyz",
			reversibility: "irreversible" as Reversibility,
			status: "captured" as ProposedCallStatus,
		};
		// The v1 kernel-executor fields must not exist (AC12)
		expect("capabilityTool" in call).toBe(false);
		expect("operation" in call).toBe(false);
		expect("params" in call).toBe(false);
		expect("consequenceId" in call).toBe(false);
		expect("idempotencyKey" in call).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — SessionWorkflow shape
// ─────────────────────────────────────────────────────────────────────────────

describe("T2: SessionWorkflow shape", () => {
	it("session-1 open-work SessionWorkflow has routeToReview=['irreversible'] + sessionRole", () => {
		const wf: SessionWorkflow = {
			routeToReview: ["irreversible"],
			sessionRole: "open-work",
		};
		expect(wf.sessionRole).toBe("open-work");
		expect(wf.routeToReview).toContain("irreversible");
		expect(wf.approvedCall).toBeUndefined();
	});

	it("session-2 grant-bearing SessionWorkflow carries approvedCall", () => {
		const wf: SessionWorkflow = {
			routeToReview: ["irreversible"],
			sessionRole: "grant-bearing",
			approvedCall: {
				toolId: "commit_file",
				args: { path: "/workspace/out.txt", content: "done" },
				argPinned: false,
			},
		};
		expect(wf.sessionRole).toBe("grant-bearing");
		expect(wf.approvedCall?.toolId).toBe("commit_file");
		// Arg-pin false → no exact-match (we trust re-derivation, not a guard)
		expect(wf.approvedCall?.argPinned).toBe(false);
	});

	it("grant-bearing SessionWorkflow with arg-pin and identityHash", () => {
		const wf: SessionWorkflow = {
			routeToReview: ["irreversible"],
			sessionRole: "grant-bearing",
			approvedCall: {
				toolId: "commit_file",
				args: { path: "/workspace/out.txt", content: "done" },
				argPinned: true,
				identityHash: "sha256-abc",
			},
		};
		expect(wf.approvedCall?.argPinned).toBe(true);
		// identityHash is optional metadata (convenience, NOT a guard)
		expect(wf.approvedCall?.identityHash).toBe("sha256-abc");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — ProposedCallGrantedEvent in KernelEvent union + bus round-trip (AC3)
// ─────────────────────────────────────────────────────────────────────────────

describe("T3: ProposedCallGrantedEvent is in the KernelEvent union", () => {
	it("EventBus.on('proposed_call_granted') receives the published event with correct payload", () => {
		const bus = new EventBus();
		const received: ProposedCallGrantedEvent[] = [];
		bus.on("proposed_call_granted", (e) => received.push(e));

		const event: ProposedCallGrantedEvent = {
			type: "proposed_call_granted",
			streamId: "thread-1",
			proposedCallId: "pc-1",
			taskId: "task-1",
			agentId: "agent-1",
			timestamp: Date.now(),
		};

		// EventBus.emit requires KernelEvent — fails to compile if
		// ProposedCallGrantedEvent is not in the KernelEvent union.
		bus.emit(event as KernelEvent);

		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe("proposed_call_granted");
		expect(received[0]?.proposedCallId).toBe("pc-1");
		expect(received[0]?.taskId).toBe("task-1");
		expect(received[0]?.agentId).toBe("agent-1");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — AC13: exhaustive KernelEvent switch still compiles after AL7 additions
// (verdict grammar unchanged; new events added, none removed from prior list)
// ─────────────────────────────────────────────────────────────────────────────

describe("T4: exhaustive KernelEvent switch handles proposed_call_granted (AC13)", () => {
	it("switch(event.type) over KernelEvent compiles with proposed_call_granted + no operation_executed", () => {
		// This switch must compile without a default arm; any missing arm causes a TS error.
		// AL7 renames operation_executed → proposed_call_executed and adds proposed_call_granted.
		function handleEvent(event: KernelEvent): string {
			switch (event.type) {
				case "agent_work_intent_recorded":
					return "agent_work_intent_recorded";
				case "agent_run_lifecycle_changed":
					return "agent_run_lifecycle_changed";
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
				case "session_handoff_completed":
					return "session_handoff_completed";
				case "session_not_returned":
					return "session_not_returned";
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
				// AU19 Increment 3f: filesystems ⚠ capture-writeback EventBus inversion
				case "sandbox_writeback_changes_detected":
					return "sandbox_writeback_changes_detected";
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
				case "team_created":
					return "team_created";
				case "agent_added":
					return "agent_added";
				case "user_created":
					return "user_created";
				case "work_selection_requested":
					return "work_selection_requested";
				case "work_decompose_requested":
					return "work_decompose_requested";
				// AL7 trust-first: operation_executed renamed to proposed_call_executed
				case "proposed_call_executed":
					return "proposed_call_executed";
				// AL7: re-engage trigger after approve
				case "proposed_call_granted":
					return "proposed_call_granted";
			}
		}

		const event: ProposedCallGrantedEvent = {
			type: "proposed_call_granted",
			streamId: "thread-x",
			proposedCallId: "pc-x",
			taskId: "task-x",
			agentId: "agent-x",
			timestamp: Date.now(),
		};
		expect(handleEvent(event as KernelEvent)).toBe("proposed_call_granted");
	});
});
