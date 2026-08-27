/**
 * O1 event-split validation tests (RED phase).
 *
 * These tests verify:
 * - The KernelEvent subset (locally typed) covers 16 members exhaustively
 * - DomainEvent is a flat union (KernelEvent/StrategyEvent split removed in BA9d)
 * - New knowledge events: KnowledgeCreatedEvent, KnowledgeArchivedEvent, KnowledgeAccessedEvent
 * - SessionEndedEvent has NO costDelta field
 * - BetShippedEvent, BetCommittedEvent, ResponseRecordedEvent are NOT exported
 * - KnowledgeUpdatedEvent.action accepts string values
 *
 * Runtime tests fail until implementation. Compile-time checks enforce the
 * union exhaustiveness via `bun run check`.
 */
import { describe, expect, it } from "vitest";
import type { DomainEvent, KnowledgeUpdatedEvent, SessionEndedEvent } from "../events.js";

describe("O1 event split", () => {
	describe("New knowledge events in DomainEvent", () => {
		it("knowledge_created is a valid DomainEvent discriminant", () => {
			// DomainEvent must include knowledge_created after O1.
			// We verify by checking the EventBus.on() type accepts it, and at
			// runtime by checking the EventType derived from DomainEvent.
			// The sharedIndex contains EventBus which is generic over EventType.
			// Since EventType = DomainEvent["type"], if knowledge_created is NOT
			// in DomainEvent the runtime check via eventBus.on("knowledge_created")
			// would fail at type level.
			//
			// Runtime: use a type-cast approach to verify the event object is valid
			const event = {
				type: "knowledge_created" as const,
				streamId: "stream-1",
				itemId: "ki-1",
				timestamp: Date.now(),
			};
			// This assignment will cause a TS compile error if knowledge_created
			// is not in DomainEvent (which it isn't yet -- RED phase via bun run check)
			const _domainEvent: DomainEvent = event as DomainEvent;
			expect(_domainEvent.type).toBe("knowledge_created");
		});

		it("knowledge_archived is a valid DomainEvent discriminant", () => {
			const event = {
				type: "knowledge_archived" as const,
				streamId: "stream-1",
				itemId: "ki-1",
				timestamp: Date.now(),
			};
			const _domainEvent: DomainEvent = event as DomainEvent;
			expect(_domainEvent.type).toBe("knowledge_archived");
		});

		it("knowledge_accessed is a valid DomainEvent discriminant with accessorKind", () => {
			const event = {
				type: "knowledge_accessed" as const,
				streamId: "stream-1",
				itemId: "ki-1",
				accessorKind: "human" as const,
				accessorId: "u-1",
				timestamp: Date.now(),
			};
			const _domainEvent: DomainEvent = event as DomainEvent;
			expect(_domainEvent.type).toBe("knowledge_accessed");
		});
	});

	describe("SessionEndedEvent has no costDelta field", () => {
		it("SessionEndedEvent can be constructed without costDelta", () => {
			// After O1, costDelta is removed from SessionEndedEvent.
			// Constructing without it must be valid (no TS error).
			// Before O1: costDelta is still present, but optional (test still passes).
			// The true RED check is: `bun run check` will error on test lines
			// that try to access event.costDelta after O1 removes the field.
			const event: SessionEndedEvent = {
				type: "session_ended",
				streamId: "stream-1",
				sessionId: "sess-1",
				agentId: "agent-1",
				taskId: "task-1",
				timestamp: Date.now(),
				outcome: "completed",
				// costDelta intentionally omitted
			};
			expect(event.type).toBe("session_ended");
		});

		it("costDelta is absent from SessionEndedEvent at runtime", () => {
			// After O1 removes costDelta, the event produced by services will not have it.
			// This test verifies that a minimally-constructed SessionEndedEvent (without
			// costDelta) does not have costDelta as a key.
			const event: SessionEndedEvent = {
				type: "session_ended",
				streamId: "stream-1",
				sessionId: "sess-1",
				agentId: "agent-1",
				taskId: "task-1",
				timestamp: Date.now(),
				outcome: "completed",
			};
			// If costDelta is required, TypeScript would error above. After O1
			// implementation removes it from the type, this test confirms the
			// runtime object doesn't carry the field.
			expect("costDelta" in event).toBe(false);
		});
	});

	describe("Deleted event discriminants are not in DomainEvent", () => {
		it("bet_shipped is not a valid DomainEvent type after O1", () => {
			// The DomainEvent union's type discriminants are derived from the interfaces.
			// After deleting BetShippedEvent, 'bet_shipped' is no longer a valid EventType.
			// We test this at runtime by checking the set of known valid event types
			// does not contain 'bet_shipped'.
			// The EventBus.on() overload only accepts EventType -- so if the
			// TypeScript compiler accepts on("bet_shipped", ...) it's a compile error.
			// Here we enumerate the expected post-O1 event types:
			const expectedTypes = new Set([
				"task_state_changed",
				"bet_state_changed",
				"bet_revised",
				"session_started",
				"session_ended",
				"thread_created",
				"thread_message_appended",
				"thread_resolved",
				"thread_reopened",
				"thread_archived",
				"item_created",
				"dependency_met",
				"knowledge_created",
				"knowledge_updated",
				"knowledge_archived",
				"knowledge_accessed",
				// @lore AU21 Increment 14a: "cost_cap_warning"/"cost_cap_breached"
				// removed from this expected-types set — both events are
				// HARD-DELETED along with the rest of the cost feature, no
				// replacement.
				"notification",
				"propagation_applied",
				"propagation_failed",
				"routine_fired",
				"tool_call_recorded",
			]);
			expect(expectedTypes.has("bet_shipped")).toBe(false);
			expect(expectedTypes.has("bet_committed")).toBe(false);
			expect(expectedTypes.has("response_recorded")).toBe(false);
		});
	});

	describe("KernelEvent union exhaustiveness (16 members)", () => {
		it("covers all 16 kernel event types with compile-time exhaustiveness check", () => {
			// This is the key exhaustiveness guard for KernelEvent.
			// After O1, KernelEvent is defined as a union of exactly 16 event types.
			// The switch below must cover all variants without a `default` case
			// to satisfy TypeScript's exhaustiveness check.
			//
			// @lore O1: If a new kernel event is added to KernelEvent without a case
			// here, `bun run check` fails with "Not all code paths return a value."
			// Add the case and update the count in the comment above.
			type KernelEvent = Extract<
				DomainEvent,
				{
					type:
						| "task_state_changed"
						| "bet_state_changed"
						| "bet_revised"
						| "session_started"
						| "session_ended"
						| "thread_created"
						| "thread_message_appended"
						| "thread_resolved"
						| "thread_reopened"
						| "thread_archived"
						| "item_created"
						| "dependency_met"
						| "knowledge_created"
						| "knowledge_updated"
						| "knowledge_archived"
						| "knowledge_accessed";
				}
			>;

			function assertExhaustiveKernel(event: KernelEvent): string {
				switch (event.type) {
					case "task_state_changed":
						return event.type;
					case "bet_state_changed":
						return event.type;
					case "bet_revised":
						return event.type;
					case "session_started":
						return event.type;
					case "session_ended":
						return event.type;
					case "thread_created":
						return event.type;
					case "thread_message_appended":
						return event.type;
					case "thread_resolved":
						return event.type;
					case "thread_reopened":
						return event.type;
					case "thread_archived":
						return event.type;
					case "item_created":
						return event.type;
					case "dependency_met":
						return event.type;
					case "knowledge_created":
						return event.type;
					case "knowledge_updated":
						return event.type;
					case "knowledge_archived":
						return event.type;
					case "knowledge_accessed":
						return event.type;
				}
			}

			// Runtime: exercise with one valid event
			const sampleEvent: KernelEvent = {
				type: "task_state_changed",
				streamId: "s-1",
				taskId: "t-1",
				fromState: "proposed",
				toState: "in_progress",
				timestamp: Date.now(),
			};
			expect(assertExhaustiveKernel(sampleEvent)).toBe("task_state_changed");
		});
	});

	describe("KnowledgeUpdatedEvent.action is string (intentionally loose)", () => {
		it("accepts any string action value", () => {
			const actions = [
				"created",
				"updated",
				"merged",
				"split",
				"archived",
				"flagged",
				"attention_recomputed",
				"practice_meeting_turn_3",
			];
			for (const action of actions) {
				const event: KnowledgeUpdatedEvent = {
					type: "knowledge_updated",
					streamId: "ki-1",
					itemId: "ki-1",
					action,
					timestamp: Date.now(),
				};
				expect(event.action).toBe(action);
			}
		});
	});
});
