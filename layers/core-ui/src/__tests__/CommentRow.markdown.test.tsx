/**
 * R3 — `CommentRow` markdown rendering tests (AC-9 through AC-15).
 *
 * Tests written BEFORE implementation (TDD red phase). Every test here
 * fails until CommentRow is updated to render plain messages through
 * the block payload pipeline (Task 4 in architecture.md).
 *
 * @lore R3 C-1 (reviewer): CommentRow is the rendering surface — tested
 * directly. The sanitizeHtml prop is threaded through CommentRowProps so
 * the web consumer (Conversations.tsx → ThreadShell) can pass DOMPurify.
 * Tests here verify the prop contract and the rendering behavior, not
 * the ThreadShell wiring (that is covered by ThreadShell.test.tsx).
 */

import type { Message } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentRow } from "../ds";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sender = {
	id: "u-founder",
	name: "Founder",
	role: "founder",
};

function plain(text: string): Message {
	return {
		id: "m-md",
		threadId: "t-1",
		senderId: "u-founder",
		clientKey: "k-md",
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
	payload: {
		decision: "approve",
		resolvesMessageId: "m-rev",
	},
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

// ---------------------------------------------------------------------------
// AC-9: Plain messages rendered through the block payload pipeline
// ---------------------------------------------------------------------------

describe("CommentRow markdown rendering (AC-9)", () => {
	it("renders bold text as <strong>", () => {
		render(
			<CommentRow message={plain("**bold message**")} sender={sender} showSenderHeader={true} />,
		);
		const strong = document.querySelector("strong");
		expect(strong).not.toBeNull();
		expect(strong?.textContent).toContain("bold message");
	});

	it("renders italic text as <em>", () => {
		render(
			<CommentRow message={plain("*italic message*")} sender={sender} showSenderHeader={true} />,
		);
		const em = document.querySelector("em");
		expect(em).not.toBeNull();
		expect(em?.textContent).toContain("italic message");
	});

	it("renders inline code as <code>", () => {
		render(
			<CommentRow
				message={plain("use `const x = 1` here")}
				sender={sender}
				showSenderHeader={true}
			/>,
		);
		const code = document.querySelector("code");
		expect(code).not.toBeNull();
		expect(code?.textContent).toContain("const x = 1");
	});
});

// ---------------------------------------------------------------------------
// AC-10: Fenced code blocks render with <pre> monospace
// ---------------------------------------------------------------------------

describe("CommentRow fenced code block rendering (AC-10)", () => {
	it("renders a fenced code block as a <pre> element", () => {
		const md = "```ts\nconst x = 1;\n```";
		render(<CommentRow message={plain(md)} sender={sender} showSenderHeader={true} />);
		const pre = document.querySelector("pre");
		expect(pre).not.toBeNull();
	});

	it("code block content is inside the <pre>", () => {
		const md = "```js\nconsole.log('hello');\n```";
		render(<CommentRow message={plain(md)} sender={sender} showSenderHeader={true} />);
		const pre = document.querySelector("pre");
		expect(pre?.textContent).toContain("console.log");
	});
});

// ---------------------------------------------------------------------------
// AC-11: Bold, italic, lists, and headings render correctly
// ---------------------------------------------------------------------------

describe("CommentRow formatting renders correctly (AC-11)", () => {
	it("renders an unordered list as <ul> with <li> items", () => {
		const md = "- item one\n- item two\n- item three";
		render(<CommentRow message={plain(md)} sender={sender} showSenderHeader={true} />);
		const ul = document.querySelector("ul");
		expect(ul).not.toBeNull();
		const items = document.querySelectorAll("li");
		// At least 3 list items (not counting the comment-row <li> itself which is the outer wrapper)
		const listItems = Array.from(items).filter(
			(li) =>
				li.textContent?.trim() === "item one" ||
				li.textContent?.trim() === "item two" ||
				li.textContent?.trim() === "item three",
		);
		expect(listItems.length).toBeGreaterThanOrEqual(3);
	});

	it("renders an ordered list as <ol>", () => {
		const md = "1. first\n2. second\n3. third";
		render(<CommentRow message={plain(md)} sender={sender} showSenderHeader={true} />);
		const ol = document.querySelector("ol");
		expect(ol).not.toBeNull();
	});

	it("renders a heading as a heading element (h1-h6)", () => {
		const md = "## Section heading";
		render(<CommentRow message={plain(md)} sender={sender} showSenderHeader={true} />);
		const h2 = document.querySelector("h2");
		expect(h2).not.toBeNull();
		expect(h2?.textContent).toContain("Section heading");
	});
});

// ---------------------------------------------------------------------------
// AC-12: Links render as <a> elements with href
// ---------------------------------------------------------------------------

describe("CommentRow link rendering (AC-12)", () => {
	it("renders a markdown link as an <a> element", () => {
		render(
			<CommentRow
				message={plain("[Visit Example](https://example.com)")}
				sender={sender}
				showSenderHeader={true}
			/>,
		);
		const anchor = document.querySelector("a");
		expect(anchor).not.toBeNull();
		expect(anchor?.getAttribute("href")).toBe("https://example.com");
		expect(anchor?.textContent).toContain("Visit Example");
	});

	it("renders a mailto link as <a>", () => {
		render(
			<CommentRow
				message={plain("[email me](mailto:test@example.com)")}
				sender={sender}
				showSenderHeader={true}
			/>,
		);
		const anchor = document.querySelector("a");
		expect(anchor).not.toBeNull();
		expect(anchor?.getAttribute("href")).toBe("mailto:test@example.com");
	});
});

// ---------------------------------------------------------------------------
// AC-13: No-markdown messages render as single <p> (regression)
// ---------------------------------------------------------------------------

describe("CommentRow plain text regression (AC-13)", () => {
	it("plain text with no markdown renders inside a <p> tag", () => {
		render(<CommentRow message={plain("hello world")} sender={sender} showSenderHeader={true} />);
		expect(screen.getByText("hello world")).toBeInTheDocument();
		// The text must be inside a <p> element
		const p = document.querySelector("p");
		expect(p).not.toBeNull();
		expect(p?.textContent).toContain("hello world");
	});

	it("the sender name is still rendered above plain text", () => {
		render(<CommentRow message={plain("hello world")} sender={sender} showSenderHeader={true} />);
		expect(screen.getByText("Founder")).toBeInTheDocument();
	});

	it("'ping' text still renders after markdown pipeline change", () => {
		render(<CommentRow message={plain("ping")} sender={sender} showSenderHeader={false} />);
		expect(screen.getByText("ping")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-14: Verdict/review/questionnaire rendering unchanged
// ---------------------------------------------------------------------------

describe("CommentRow non-plain message types unchanged (AC-14)", () => {
	it("verdict message still renders the StatusChip with APPROVED", () => {
		render(<CommentRow message={verdictApprove} sender={sender} showSenderHeader={true} />);
		expect(screen.getByText("APPROVED")).toBeInTheDocument();
	});

	it("redacted message still shows the Redacted label", () => {
		render(<CommentRow message={redactedPlain} sender={sender} showSenderHeader={true} />);
		expect(screen.getByText(/redacted/i)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-15: HTML sanitized via sanitizeHtml callback
// ---------------------------------------------------------------------------

describe("CommentRow HTML sanitization (AC-15)", () => {
	it("CommentRowProps accepts a sanitizeHtml prop (type-level)", () => {
		// This test verifies the prop exists by rendering without type errors.
		// If sanitizeHtml is not in CommentRowProps, TypeScript will fail here.
		const sanitizeHtml = vi.fn((raw: string) => raw);
		render(
			<CommentRow
				message={plain("normal text")}
				sender={sender}
				showSenderHeader={true}
				sanitizeHtml={sanitizeHtml}
			/>,
		);
		expect(screen.getByText("normal text")).toBeInTheDocument();
	});

	it("when sanitizeHtml is provided, it is called for raw HTML blocks", () => {
		const sanitizeHtml = vi.fn((raw: string) => raw);
		// An HTML block is passed — note: remark-gfm treats bare HTML as an html block
		const md = "<details><summary>click</summary>content</details>";
		render(
			<CommentRow
				message={plain(md)}
				sender={sender}
				showSenderHeader={true}
				sanitizeHtml={sanitizeHtml}
			/>,
		);
		// sanitizeHtml should have been invoked for the raw HTML payload
		expect(sanitizeHtml).toHaveBeenCalled();
	});

	it("when sanitizeHtml is not provided, <script> tags are not injected into the DOM", () => {
		// Without sanitizeHtml, html payloads degrade to UnknownPayload (shows raw source)
		// and never inject executable HTML into the DOM.
		const md = "<script>alert('xss')</script>";
		render(
			<CommentRow
				message={plain(md)}
				sender={sender}
				showSenderHeader={true}
				// No sanitizeHtml prop — defense-in-depth
			/>,
		);
		// No <script> element should appear in the DOM
		const scripts = document.querySelectorAll("script");
		// Only the pre-existing test scripts (setup), not injected ones from message content
		const injected = Array.from(scripts).filter(
			(s) => s.textContent?.includes("alert") || s.src?.includes("alert"),
		);
		expect(injected).toHaveLength(0);
	});

	it("when sanitizeHtml strips dangerous content, the stripped output is rendered", () => {
		// Simulate DOMPurify: strip <script> from HTML
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
		// The sanitized output is rendered, not the raw script
		expect(container.textContent).toContain("safe content");
	});
});
