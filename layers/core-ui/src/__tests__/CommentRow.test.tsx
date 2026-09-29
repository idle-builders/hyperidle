/**
 * CommentRow: plain/verdict/inline-comment/redacted rendering, sender-header
 * grouping, the rich-row slots (review/questionnaire), @mention tokens, the
 * markdown pipeline (bold/italic/code/lists/headings/links), and HTML
 * sanitization via the sanitizeHtml callback.
 */

import type { Message } from "@hyperidle/domain-model";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentRow } from "../ds";

const sender = { id: "u-founder", name: "Founder", role: "founder" };
const agentSender = { id: "u-agent", name: "Aria", role: "builder", isAgent: true };

function plain(text: string): Message {
	return {
		id: "m-p",
		threadId: "t-1",
		senderId: "u-founder",
		clientKey: "k",
		blockId: null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-04-19T12:00:00.000Z",
		type: "plain",
		payload: { text },
	};
}

const verdictApprove: Message = {
	id: "m-v",
	threadId: "t-1",
	senderId: "u-founder",
	clientKey: "kv",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "verdict",
	payload: { decision: "approve", resolvesMessageId: "m-rev" },
};

const redactedPlain: Message = {
	id: "m-r",
	threadId: "t-1",
	senderId: "u-founder",
	clientKey: "kr",
	blockId: null,
	deletedAt: null,
	redactedAt: "2026-04-19T13:00:00.000Z",
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "plain",
	payload: {
		redacted: true,
		redactedBy: "u-founder",
		redactedAt: "2026-04-19T13:00:00.000Z",
		reason: "PII",
	},
};

describe("CommentRow", () => {
	it("renders the sender name + body for plain messages, hiding the header when showSenderHeader=false", () => {
		const { rerender } = render(
			<CommentRow message={plain("hello world")} sender={sender} showSenderHeader={true} />,
		);
		expect(screen.getByText("Founder")).toBeInTheDocument();
		expect(screen.getByText("hello world")).toBeInTheDocument();

		rerender(<CommentRow message={plain("ping")} sender={sender} showSenderHeader={false} />);
		expect(screen.queryByText("Founder")).toBeNull();
		expect(screen.getByText("ping")).toBeInTheDocument();
	});

	it("renders a StatusChip with the decision label for verdict messages", () => {
		render(<CommentRow message={verdictApprove} sender={sender} showSenderHeader={true} />);
		expect(screen.getByText("APPROVED")).toBeInTheDocument();
	});

	it("renders the inline-comment anchor label when inlineAnchor is provided", () => {
		render(
			<CommentRow
				message={plain("body")}
				sender={sender}
				showSenderHeader={true}
				inlineAnchor="src/foo.ts:42"
			/>,
		);
		expect(screen.getByText(/INLINE COMMENT ON/i)).toBeInTheDocument();
		expect(screen.getByText(/src\/foo\.ts:42/)).toBeInTheDocument();
	});

	it("renders a 'Redacted' label for redacted messages", () => {
		render(<CommentRow message={redactedPlain} sender={sender} showSenderHeader={true} />);
		expect(screen.getByText(/redacted/i)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Rich-row variant: review/questionnaire slots
// ---------------------------------------------------------------------------

describe("CommentRow rich-row variant", () => {
	function review(): Message {
		return {
			id: "m-rev-2",
			threadId: "t-1",
			senderId: "agent-1",
			clientKey: "k-rev-2",
			blockId: null,
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: "2026-04-19T12:30:00.000Z",
			type: "review",
			payload: {
				title: "Second review",
				reasoning: ["Renders as a rich row"],
				producedItemId: "art-2",
			},
		};
	}

	const richSlots = {
		richHeader: <div data-testid="rh">richHeader-slot</div>,
		richBody: <div data-testid="rb">richBody-slot</div>,
		richActions: <div data-testid="ra">richActions-slot</div>,
	};

	it("renders the richHeader/richBody/richActions slots and the standard row chrome alongside them", () => {
		render(
			<CommentRow
				message={review()}
				sender={{ id: "agent-1", name: "Aria" }}
				showSenderHeader={true}
				{...richSlots}
			/>,
		);
		expect(screen.getByTestId("rh")).toBeInTheDocument();
		expect(screen.getByTestId("rb")).toBeInTheDocument();
		expect(screen.getByTestId("ra")).toBeInTheDocument();
		// Sender name still rendered — the row chrome is unchanged.
		expect(screen.getByText("Aria")).toBeInTheDocument();
	});

	it("ignores rich slots for plain messages (defensive — slots only apply to review/questionnaire)", () => {
		render(
			<CommentRow
				message={plain("hello")}
				sender={{ id: "u-founder", name: "Founder" }}
				showSenderHeader={true}
				richHeader={<div data-testid="rh">should-not-render</div>}
			/>,
		);
		expect(screen.queryByTestId("rh")).toBeNull();
		const row = screen.getAllByTestId("comment-row")[0]!;
		expect(within(row).getByText("hello")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// @mention tokens
// ---------------------------------------------------------------------------

describe("CommentRow mention rendering", () => {
	const mentionRef = {
		kind: "mention" as const,
		identityId: "u-agent",
		displayName: "Aria",
		sourceText: "@Aria",
	};

	it("renders plain text without mention spans when there are no refs", () => {
		render(
			<CommentRow
				message={plain("Just a plain message no mentions")}
				sender={sender}
				showSenderHeader={true}
			/>,
		);
		expect(screen.getByText(/Just a plain message no mentions/)).toBeInTheDocument();
	});

	it("renders @Name as a <span> when a MentionRef names it, mid-sentence or with multiple mentions", () => {
		const msg: Message = {
			...plain("Hey @Aria and @Bob please help"),
			payload: {
				text: "Hey @Aria and @Bob please help",
				refs: [
					mentionRef,
					{ ...mentionRef, identityId: "u-bob", displayName: "Bob", sourceText: "@Bob" },
				],
			},
		};
		render(<CommentRow message={msg} sender={sender} showSenderHeader={true} />);
		const ariaToken = screen.getByText("@Aria");
		expect(ariaToken.tagName.toLowerCase()).toBe("span");
		expect(screen.getByText("@Bob")).toBeInTheDocument();
	});

	it("renders an unresolved @name (no matching MentionRef) as plain text", () => {
		const msg: Message = {
			...plain("Hey @Unknown check this"),
			payload: { text: "Hey @Unknown check this", refs: [] },
		};
		render(<CommentRow message={msg} sender={sender} showSenderHeader={true} />);
		expect(document.body.textContent ?? "").toContain("@Unknown");
	});

	it("redacted messages do not show mention spans", () => {
		render(<CommentRow message={redactedPlain} sender={sender} showSenderHeader={true} />);
		expect(screen.queryByText(/@Aria/)).toBeNull();
	});

	it("renders a mention token for the agent sender too", () => {
		const msg: Message = {
			...plain("Hello @Aria"),
			payload: { text: "Hello @Aria", refs: [mentionRef] },
		};
		render(<CommentRow message={msg} sender={agentSender} showSenderHeader={true} />);
		expect(screen.getByText("@Aria")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Markdown pipeline
// ---------------------------------------------------------------------------

describe("CommentRow markdown rendering", () => {
	it("renders bold as <strong>, italic as <em>, inline code as <code>", () => {
		const { rerender } = render(
			<CommentRow message={plain("**bold message**")} sender={sender} showSenderHeader={true} />,
		);
		expect(document.querySelector("strong")?.textContent).toContain("bold message");

		rerender(
			<CommentRow message={plain("*italic message*")} sender={sender} showSenderHeader={true} />,
		);
		expect(document.querySelector("em")?.textContent).toContain("italic message");

		rerender(
			<CommentRow
				message={plain("use `const x = 1` here")}
				sender={sender}
				showSenderHeader={true}
			/>,
		);
		expect(document.querySelector("code")?.textContent).toContain("const x = 1");
	});

	it("renders a fenced code block as a <pre> containing its content", () => {
		const md = "```js\nconsole.log('hello');\n```";
		render(<CommentRow message={plain(md)} sender={sender} showSenderHeader={true} />);
		expect(document.querySelector("pre")?.textContent).toContain("console.log");
	});

	it("renders unordered lists, ordered lists, and headings", () => {
		const { rerender } = render(
			<CommentRow
				message={plain("- item one\n- item two\n- item three")}
				sender={sender}
				showSenderHeader={true}
			/>,
		);
		const listItems = Array.from(document.querySelectorAll("li")).filter((li) =>
			["item one", "item two", "item three"].includes(li.textContent?.trim() ?? ""),
		);
		expect(listItems.length).toBe(3);

		rerender(
			<CommentRow
				message={plain("1. first\n2. second\n3. third")}
				sender={sender}
				showSenderHeader={true}
			/>,
		);
		expect(document.querySelector("ol")).not.toBeNull();

		rerender(
			<CommentRow message={plain("## Section heading")} sender={sender} showSenderHeader={true} />,
		);
		expect(document.querySelector("h2")?.textContent).toContain("Section heading");
	});

	it("renders markdown and mailto links as <a> elements with the right href", () => {
		const { rerender } = render(
			<CommentRow
				message={plain("[Visit Example](https://example.com)")}
				sender={sender}
				showSenderHeader={true}
			/>,
		);
		const anchor = document.querySelector("a");
		expect(anchor?.getAttribute("href")).toBe("https://example.com");
		expect(anchor?.textContent).toContain("Visit Example");

		rerender(
			<CommentRow
				message={plain("[email me](mailto:test@example.com)")}
				sender={sender}
				showSenderHeader={true}
			/>,
		);
		expect(document.querySelector("a")?.getAttribute("href")).toBe("mailto:test@example.com");
	});

	it("plain text with no markdown still renders inside a <p>, with the sender name above it", () => {
		render(<CommentRow message={plain("hello world")} sender={sender} showSenderHeader={true} />);
		expect(screen.getByText("Founder")).toBeInTheDocument();
		expect(document.querySelector("p")?.textContent).toContain("hello world");
	});
});

// ---------------------------------------------------------------------------
// HTML sanitization
// ---------------------------------------------------------------------------

describe("CommentRow HTML sanitization", () => {
	it("invokes the sanitizeHtml callback for a raw HTML block", () => {
		const sanitizeHtml = vi.fn((raw: string) => raw);
		const md = "<details><summary>click</summary>content</details>";
		render(
			<CommentRow
				message={plain(md)}
				sender={sender}
				showSenderHeader={true}
				sanitizeHtml={sanitizeHtml}
			/>,
		);
		expect(sanitizeHtml).toHaveBeenCalled();
	});

	it("without sanitizeHtml, a <script> payload is never injected into the DOM", () => {
		const md = "<script>alert('xss')</script>";
		render(<CommentRow message={plain(md)} sender={sender} showSenderHeader={true} />);
		const injected = Array.from(document.querySelectorAll("script")).filter(
			(s) => s.textContent?.includes("alert") || s.src?.includes("alert"),
		);
		expect(injected).toHaveLength(0);
	});

	it("renders the stripped output when sanitizeHtml strips dangerous content", () => {
		const sanitizeHtml = vi.fn((_raw: string) => "<p>safe content</p>");
		const md = "<script>alert('xss')</script>";
		const { container } = render(
			<CommentRow
				message={plain(md)}
				sender={sender}
				showSenderHeader={true}
				sanitizeHtml={sanitizeHtml}
			/>,
		);
		expect(container.textContent).toContain("safe content");
	});
});
