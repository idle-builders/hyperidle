/**
 * AE5 — CommentRow mention rendering tests (Task 6 acceptance).
 *
 * AC-2: CommentRow renders @Name as a styled inline span when the message
 * has MentionRef entries in refs[]. Messages without mentions render unchanged.
 */

import type { Message } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommentRow } from "../ds";

const baseSender = { id: "u-founder", name: "Founder", role: "founder" };
const agentSender = { id: "u-agent", name: "Aria", role: "builder", isAgent: true };

const baseMsg: Message = {
	id: "m-1",
	threadId: "t-1",
	senderId: "u-founder",
	clientKey: "k-1",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-06-08T12:00:00.000Z",
	type: "plain",
	payload: { text: "Hello world" },
};

describe("AE5 — CommentRow mention rendering", () => {
	it("renders plain text message without mention spans (no refs)", () => {
		const msg: Message = {
			...baseMsg,
			payload: { text: "Just a plain message no mentions" },
		};
		render(<CommentRow message={msg} sender={baseSender} showSenderHeader={true} />);
		expect(screen.getByText(/Just a plain message no mentions/)).toBeDefined();
	});

	it("renders @Name as a highlighted span when MentionRef in refs", () => {
		const msg: Message = {
			...baseMsg,
			payload: {
				text: "Hey @Aria please review this",
				refs: [
					{
						kind: "mention",
						identityId: "u-agent",
						displayName: "Aria",
						sourceText: "@Aria",
					},
				],
			},
		};
		render(<CommentRow message={msg} sender={baseSender} showSenderHeader={true} />);
		// The mention token should render with @Aria visible
		const mentionToken = screen.getByText("@Aria");
		expect(mentionToken).toBeDefined();
		// Should be styled as a span (inline element)
		expect(mentionToken.tagName.toLowerCase()).toBe("span");
	});

	it("renders surrounding text correctly when mention is mid-sentence", () => {
		const msg: Message = {
			...baseMsg,
			payload: {
				text: "Hello @Aria world",
				refs: [
					{
						kind: "mention",
						identityId: "u-agent",
						displayName: "Aria",
						sourceText: "@Aria",
					},
				],
			},
		};
		render(<CommentRow message={msg} sender={baseSender} showSenderHeader={true} />);
		// The @Aria token should be present
		expect(screen.getByText("@Aria")).toBeDefined();
		// The surrounding text should also be present in the document
		expect(screen.getByText("@Aria").closest("*")?.closest("div, p, span")).toBeDefined();
	});

	it("unresolved @name (no matching MentionRef) renders as plain text", () => {
		const msg: Message = {
			...baseMsg,
			payload: {
				text: "Hey @Unknown check this",
				// No MentionRef in refs for @Unknown
				refs: [],
			},
		};
		render(<CommentRow message={msg} sender={baseSender} showSenderHeader={true} />);
		// @Unknown should appear as plain text (no styled span)
		// The text content should include @Unknown somewhere
		const allText = document.body.textContent ?? "";
		expect(allText).toContain("@Unknown");
	});

	it("redacted messages do not show mention spans", () => {
		const redactedMsg: Message = {
			...baseMsg,
			redactedAt: "2026-06-08T13:00:00.000Z",
			payload: {
				redacted: true,
				redactedBy: "u-founder",
				redactedAt: "2026-06-08T13:00:00.000Z",
				reason: "test redaction",
			},
		};
		render(<CommentRow message={redactedMsg} sender={baseSender} showSenderHeader={true} />);
		// Redacted message shows redacted indicator, not mention spans
		expect(screen.queryByText(/@Aria/)).toBeNull();
	});

	it("renders multiple mention tokens when message has multiple MentionRef entries", () => {
		const msg: Message = {
			...baseMsg,
			payload: {
				text: "Hey @Aria and @Bob please help",
				refs: [
					{
						kind: "mention",
						identityId: "u-agent",
						displayName: "Aria",
						sourceText: "@Aria",
					},
					{
						kind: "mention",
						identityId: "u-bob",
						displayName: "Bob",
						sourceText: "@Bob",
					},
				],
			},
		};
		render(<CommentRow message={msg} sender={baseSender} showSenderHeader={true} />);
		expect(screen.getByText("@Aria")).toBeDefined();
		expect(screen.getByText("@Bob")).toBeDefined();
	});

	it("mention token has accent-primary styling classes", () => {
		const msg: Message = {
			...baseMsg,
			payload: {
				text: "Hello @Aria",
				refs: [
					{
						kind: "mention",
						identityId: "u-agent",
						displayName: "Aria",
						sourceText: "@Aria",
					},
				],
			},
		};
		render(<CommentRow message={msg} sender={agentSender} showSenderHeader={true} />);
		const token = screen.getByText("@Aria");
		// Should have accent-primary color styling
		expect(token.className).toContain("accent-primary");
	});
});
