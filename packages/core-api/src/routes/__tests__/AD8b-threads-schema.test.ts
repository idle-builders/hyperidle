/**
 * AD8b — threads-schema: plainPayload toolCalls extension (RED phase).
 *
 * AC-12 (Task 12): Zod schema accepts optional toolCalls on plain payload.
 *   - plainPayloadSchema accepts payload with toolCalls array.
 *   - plainPayloadSchema accepts payload without toolCalls.
 *   - Each ToolCallSummary in toolCalls must have name, input, output, status.
 *
 * These tests import the Zod schema from threads-schema.ts which will need
 * to be extended with the toolCalls field.
 */

import { describe, expect, it } from "vitest";
import { plainPayloadSchemaWithToolCalls } from "../threads-schema.js";

describe("AD8b — plainPayloadSchema with toolCalls extension", () => {
	it("accepts payload without toolCalls (backward compatibility)", () => {
		const result = plainPayloadSchemaWithToolCalls.safeParse({ text: "Hello there" });
		expect(result.success).toBe(true);
	});

	it("accepts payload with empty toolCalls array", () => {
		const result = plainPayloadSchemaWithToolCalls.safeParse({
			text: "I completed your request.",
			toolCalls: [],
		});
		expect(result.success).toBe(true);
	});

	it("accepts payload with valid toolCalls", () => {
		const result = plainPayloadSchemaWithToolCalls.safeParse({
			text: "I found 3 tasks.",
			toolCalls: [
				{
					name: "read_inbox",
					input: { limit: 10 },
					output: "3 tasks found",
					status: "ok",
				},
			],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.toolCalls).toHaveLength(1);
			expect(result.data.toolCalls?.[0]?.name).toBe("read_inbox");
		}
	});

	it("accepts toolCalls with status='error'", () => {
		const result = plainPayloadSchemaWithToolCalls.safeParse({
			text: "Something went wrong.",
			toolCalls: [
				{
					name: "create_bet",
					input: { title: "Test Bet" },
					output: "Error: insufficient permissions",
					status: "error",
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("rejects toolCalls with invalid status value", () => {
		const result = plainPayloadSchemaWithToolCalls.safeParse({
			text: "Test",
			toolCalls: [
				{
					name: "read_inbox",
					input: {},
					output: "result",
					status: "invalid_status", // not "ok" or "error"
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("rejects toolCalls with missing output field", () => {
		const result = plainPayloadSchemaWithToolCalls.safeParse({
			text: "Test",
			toolCalls: [
				{
					name: "read_inbox",
					input: {},
					// output is missing
					status: "ok",
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("accepts multiple toolCalls in one message", () => {
		const result = plainPayloadSchemaWithToolCalls.safeParse({
			text: "I ran 2 queries for you.",
			toolCalls: [
				{ name: "read_inbox", input: {}, output: "2 messages", status: "ok" },
				{
					name: "query_practice",
					input: { query: "blocked tasks" },
					output: "1 task",
					status: "ok",
				},
			],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.toolCalls).toHaveLength(2);
		}
	});
});
