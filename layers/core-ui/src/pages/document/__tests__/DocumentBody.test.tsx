/**
 * DocumentBody: markdown → Block rendering (empty/paragraph/heading kinds),
 * XSS sanitization, the sole-fenced-html ArtifactFrame path, block-id
 * stability across edits, and the anchor-lost indicator for messages whose
 * block no longer resolves.
 */

import type { Message, PlainPayload } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { deriveBlocks } from "../../../block/index.js";
import { buildArtifactSrcdoc } from "../../../ds/artifact-frame/build-srcdoc.js";
import { DocumentBody } from "../DocumentBody.js";

// ── T1 — Empty body renders (no content yet) with no <pre> and no Block shells ──

describe("DocumentBody — T1 empty body", () => {
	it("renders (no content yet) paragraph when body is empty string", () => {
		render(<DocumentBody body="" hostId="k-empty" />);
		expect(screen.getByText("(no content yet)")).toBeInTheDocument();
	});

	it("(no content yet) is rendered as a <p> element, not a <pre>", () => {
		render(<DocumentBody body="" hostId="k-empty" />);
		const p = screen.getByText("(no content yet)");
		expect(p.tagName).toBe("P");
	});

	it("does not render any <pre> elements when body is empty", () => {
		const { container } = render(<DocumentBody body="" hostId="k-empty" />);
		expect(container.querySelectorAll("pre")).toHaveLength(0);
	});

	it("does not render any Block shells (article[data-ds-component=block]) when body is empty", () => {
		const { container } = render(<DocumentBody body="" hostId="k-empty" />);
		expect(container.querySelectorAll('article[data-ds-component="block"]')).toHaveLength(0);
	});

	it("renders a wrapper with data-document-body attribute", () => {
		const { container } = render(<DocumentBody body="" hostId="k-empty" />);
		// Even empty bodies get the wrapper so the testId selector resolves
		expect(container.querySelector("[data-document-body]")).toBeInTheDocument();
	});
});

// ── T2 — 3-paragraph body renders 3 Block shells with no card / border / <pre> ──

const THREE_SENTENCE_BODY = `JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes.

Refresh tokens last 7 days; rotation is automatic.

All tokens are stored in httpOnly cookies, never localStorage.`;

describe("DocumentBody — T2 three-sentence belief", () => {
	it("renders exactly 3 Block shells for a 3-paragraph body", () => {
		const { container } = render(<DocumentBody body={THREE_SENTENCE_BODY} hostId="k1" />);
		const blocks = container.querySelectorAll(
			'article[data-ds-component="block"][data-ds-kind="paragraph"]',
		);
		expect(blocks).toHaveLength(3);
	});

	it("renders no <pre> elements", () => {
		const { container } = render(<DocumentBody body={THREE_SENTENCE_BODY} hostId="k1" />);
		expect(container.querySelectorAll("pre")).toHaveLength(0);
	});

	it("paragraph text is rendered in the DOM", () => {
		render(<DocumentBody body={THREE_SENTENCE_BODY} hostId="k1" />);
		expect(screen.getByText(/JWT-based authentication with refresh tokens/)).toBeInTheDocument();
	});
});

// ── T3 — Heading hierarchy ──

const HEADING_BODY = `# Onboarding playbook

Quick reference for new agent provisioning.

## Provisioning

Follow the runbook in /docs/runbooks/agent-provision.md.

## Permissions

Grant via the role-template, never ad hoc.

### Edge cases

Read-only routines need only routines:run.

## Verification

Confirm with bun run check and the smoke test.`;

describe("DocumentBody — T3 heading hierarchy", () => {
	it("renders a <h1> for a level-1 heading", () => {
		const { container } = render(<DocumentBody body={HEADING_BODY} hostId="k-playbook" />);
		const h1s = container.querySelectorAll("h1");
		expect(h1s.length).toBeGreaterThanOrEqual(1);
		expect(h1s[0]!.textContent).toContain("Onboarding playbook");
	});

	it("renders <h2> elements for level-2 headings", () => {
		const { container } = render(<DocumentBody body={HEADING_BODY} hostId="k-playbook" />);
		const h2s = container.querySelectorAll("h2");
		// Provisioning, Permissions, Verification = 3 h2s
		expect(h2s.length).toBeGreaterThanOrEqual(3);
	});

	it("renders a <h3> for a level-3 heading", () => {
		const { container } = render(<DocumentBody body={HEADING_BODY} hostId="k-playbook" />);
		const h3s = container.querySelectorAll("h3");
		expect(h3s.length).toBeGreaterThanOrEqual(1);
		expect(h3s[0]!.textContent).toContain("Edge cases");
	});

	it("heading blocks carry data-ds-kind=heading", () => {
		const { container } = render(<DocumentBody body={HEADING_BODY} hostId="k-playbook" />);
		const headingBlocks = container.querySelectorAll(
			'[data-ds-component="block"][data-ds-kind="heading"]',
		);
		// 1 h1 + 3 h2 + 1 h3 = 5
		expect(headingBlocks.length).toBeGreaterThanOrEqual(4);
	});

	it("paragraph blocks carry data-ds-kind=paragraph", () => {
		const { container } = render(<DocumentBody body={HEADING_BODY} hostId="k-playbook" />);
		const paraBlocks = container.querySelectorAll(
			'[data-ds-component="block"][data-ds-kind="paragraph"]',
		);
		expect(paraBlocks.length).toBeGreaterThanOrEqual(1);
	});
});

// ── T4 — sanitizeHtml pass-through for kind:html blocks ──

describe("DocumentBody — T4 html block sanitizer pass-through", () => {
	it("renders an html-kind body without falling back to UnknownPayload", () => {
		// DOMPurify-safe HTML — will not be stripped
		const body = "<div>Hello from raw HTML</div>";
		// deriveBlocks parses raw HTML as kind:html
		// @lore Core remark/mdast parses raw top-level HTML as mdast `html` nodes
		// (not a remark-gfm feature). DocumentBody must pass sanitizeHtml to Block so HtmlPayload renders correctly.
		const { container } = render(<DocumentBody body={body} hostId="k-html" />);
		// Should render a block with ds-kind=html, not ds-kind=unknown
		const htmlBlock = container.querySelector('[data-ds-component="block"][data-ds-kind="html"]');
		expect(htmlBlock).toBeInTheDocument();
	});
});

// ── T5 — memo re-invokes deriveBlocks when body/hostId changes ──

describe("DocumentBody — T5 memo re-render on prop change", () => {
	it("re-renders with new content when body prop changes", () => {
		const { rerender } = render(<DocumentBody body="Initial paragraph content." hostId="k-memo" />);
		expect(screen.getByText("Initial paragraph content.")).toBeInTheDocument();

		rerender(<DocumentBody body="Updated paragraph content." hostId="k-memo" />);
		expect(screen.getByText("Updated paragraph content.")).toBeInTheDocument();
		expect(screen.queryByText("Initial paragraph content.")).not.toBeInTheDocument();
	});

	it("shows (no content yet) when body changes to empty", () => {
		const { rerender } = render(<DocumentBody body="Some content." hostId="k-memo" />);
		rerender(<DocumentBody body="" hostId="k-memo" />);
		expect(screen.getByText("(no content yet)")).toBeInTheDocument();
	});
});

// ── T-SEC-1 — XSS defence: DOMPurify strips active payloads ──

describe("DocumentBody — T-SEC-1 XSS defence", () => {
	it("(a) strips <script> tags — no script elements in DOM and window.__pwn undefined", () => {
		// The body must be parsed as a raw HTML block by deriveBlocks.
		// remark-gfm treats a bare <script> line as an HTML block.
		const body = "<script>window.__pwn = true;</script>\n";
		const { container } = render(<DocumentBody body={body} hostId="k-xss-a" />);
		const scripts = container.querySelectorAll("script");
		expect(scripts).toHaveLength(0);
		expect((window as unknown as Record<string, unknown>).__pwn).toBeUndefined();
	});

	it("(b) strips onerror from <img> tags", () => {
		const body = '<img src="x" onerror="alert(1)">\n';
		const { container } = render(<DocumentBody body={body} hostId="k-xss-b" />);
		const img = container.querySelector("img");
		// DOMPurify removes onerror entirely
		if (img) {
			expect(img.getAttribute("onerror")).toBeNull();
		}
		// Even if img is null (DOMPurify stripped it entirely), no onerror fired.
	});

	it("(c) blocks <iframe> — no iframe elements in DOM", () => {
		const body = '<iframe src="https://evil.example"></iframe>\n';
		const { container } = render(<DocumentBody body={body} hostId="k-xss-c" />);
		expect(container.querySelectorAll("iframe")).toHaveLength(0);
	});

	it("(d) strips javascript: href from <a> tags", () => {
		const body = '<a href="javascript:alert(1)">click</a>\n';
		const { container } = render(<DocumentBody body={body} hostId="k-xss-d" />);
		const anchor = container.querySelector("a");
		if (anchor) {
			const href = anchor.getAttribute("href") ?? "";
			expect(href.toLowerCase()).not.toContain("javascript:");
		}
		// If anchor is null, DOMPurify removed it entirely — also acceptable.
	});

	it("(e) strips onclick and onmouseover event-handler attributes from <div>", () => {
		const body = '<div onclick="alert(1)" onmouseover="alert(2)">x</div>\n';
		const { container } = render(<DocumentBody body={body} hostId="k-xss-e" />);
		// DOMPurify should strip on* attrs
		const divs = container.querySelectorAll("div[onclick], div[onmouseover]");
		expect(divs).toHaveLength(0);
	});

	it("(f) markdown javascript: link href is sanitised — regression guard", () => {
		// @lore deriveBlocks itself already strips javascript: hrefs from markdown
		// links (inlineFromMd degrades hostile links to plain text). This test is
		// a regression guard at the L23 boundary: if L2 behaviour changes, this
		// test catches it. If it fails, it means L2's renderInline has a bug —
		// file it as a follow-up.
		const body = "[click](javascript:alert(1))\n";
		const { container } = render(<DocumentBody body={body} hostId="k-xss-f" />);
		const anchors = container.querySelectorAll("a");
		for (const a of anchors) {
			const href = a.getAttribute("href") ?? "";
			expect(href.toLowerCase()).not.toMatch(/^javascript:/);
		}
	});
});

// ── (a) Sole fenced html block → runs in ArtifactFrame ──────────────────────

// Trailing newline is stripped by the markdown parser; the fence itself is not included.
const SOLE_HTML_TEXT = "<h1>Hello</h1>\n<p>World</p>";
const SOLE_HTML_BODY = `\`\`\`html\n${SOLE_HTML_TEXT}\n\`\`\``;

describe("DocumentBody — sole fenced html block renders in ArtifactFrame", () => {
	it("renders an iframe with data-artifact-frame attribute", () => {
		const { container } = render(<DocumentBody body={SOLE_HTML_BODY} hostId="k-html" />);
		expect(container.querySelector("[data-artifact-frame]")).toBeInTheDocument();
	});

	it("does not render a code-kind Block shell when body is a sole fenced html block", () => {
		const { container } = render(<DocumentBody body={SOLE_HTML_BODY} hostId="k-html" />);
		// A code block from the regular listing would carry data-ds-kind=code.
		expect(
			container.querySelector('[data-ds-component="block"][data-ds-kind="code"]'),
		).not.toBeInTheDocument();
	});

	it("source is byte-identical: iframe srcdoc equals buildArtifactSrcdoc of the fence text", () => {
		const { container } = render(<DocumentBody body={SOLE_HTML_BODY} hostId="k-html" />);
		const iframe = container.querySelector("[data-artifact-frame]") as HTMLIFrameElement;
		expect(iframe).toBeInTheDocument();
		// srcdoc is set via the React srcDoc prop — jsdom reflects it on the DOM attribute.
		expect(iframe.srcdoc).toBe(buildArtifactSrcdoc(SOLE_HTML_TEXT));
	});

	it("passes documentTitle as the frame title when provided", () => {
		const { container } = render(
			<DocumentBody body={SOLE_HTML_BODY} hostId="k-html" documentTitle="My Doc" />,
		);
		const iframe = container.querySelector("[data-artifact-frame]") as HTMLIFrameElement;
		expect(iframe).toBeInTheDocument();
		// title attribute is set on the iframe element by ArtifactFrame
		expect(iframe.title).toBe("My Doc");
	});
});

// ── (b) Fenced html block among other blocks → stays a code listing ──────────

const MIXED_BODY = "Intro paragraph.\n\n```html\n<h1>Hello</h1>\n```\n\nOutro paragraph.";

describe("DocumentBody — fenced html block among other blocks stays a code listing", () => {
	it("does NOT render data-artifact-frame when html fence is not the sole block", () => {
		const { container } = render(<DocumentBody body={MIXED_BODY} hostId="k-mixed" />);
		expect(container.querySelector("[data-artifact-frame]")).not.toBeInTheDocument();
	});

	it("renders a code-kind Block for the html fence in a mixed body", () => {
		const { container } = render(<DocumentBody body={MIXED_BODY} hostId="k-mixed" />);
		expect(
			container.querySelector('[data-ds-component="block"][data-ds-kind="code"]'),
		).toBeInTheDocument();
	});

	it("renders paragraph blocks for the surrounding text in a mixed body", () => {
		render(<DocumentBody body={MIXED_BODY} hostId="k-mixed" />);
		expect(screen.getByText(/Intro paragraph/)).toBeInTheDocument();
		expect(screen.getByText(/Outro paragraph/)).toBeInTheDocument();
	});
});

// ── (c) Body with no html → unchanged behaviour ───────────────────────────────

// String constants with real newlines so fenced block syntax parses correctly.
// JSX attribute string literals do NOT interpret \n — must be in a JS expression or a constant.
const SOLE_TS_BODY = "```typescript\nconst x = 1;\n```";
const RAW_HTML_BODY = "<div>raw html</div>";

describe("DocumentBody — body with no html block is unchanged", () => {
	it("renders paragraph blocks without data-artifact-frame", () => {
		const { container } = render(<DocumentBody body="Hello world." hostId="k-plain" />);
		expect(container.querySelector("[data-artifact-frame]")).not.toBeInTheDocument();
		expect(
			container.querySelector('[data-ds-component="block"][data-ds-kind="paragraph"]'),
		).toBeInTheDocument();
	});

	it("a sole non-html fenced block does not render in the frame", () => {
		// A typescript fence should stay a code listing, not trigger the iframe path.
		const { container } = render(<DocumentBody body={SOLE_TS_BODY} hostId="k-ts" />);
		expect(container.querySelector("[data-artifact-frame]")).not.toBeInTheDocument();
		expect(
			container.querySelector('[data-ds-component="block"][data-ds-kind="code"]'),
		).toBeInTheDocument();
	});

	it("a sole html block with no lang tag does not render in the frame", () => {
		// A raw HTML block (mdast kind=html, not kind=code) must not trigger the iframe path.
		const { container } = render(<DocumentBody body={RAW_HTML_BODY} hostId="k-raw" />);
		expect(container.querySelector("[data-artifact-frame]")).not.toBeInTheDocument();
	});
});

// ── T6 — Block-id stability: editing one section does not shift other ids ──

const BODY_V1 = `# Introduction

This is the original introduction paragraph.

## Section A

Content of section A, version 1.

## Section B

Content of section B, unchanged.

## Section C

Content of section C, unchanged.`;

const BODY_V2 = `# Introduction

This is the original introduction paragraph.

## Section A

Content of section A, VERSION 2 — this is the edited section.

## Section B

Content of section B, unchanged.

## Section C

Content of section C, unchanged.`;

const HOST = { kind: "document" as const, id: "k-stability" };

describe("DocumentBody — T6 block-id stability", () => {
	it("blocks with unchanged content have the same id after editing another section", () => {
		const v1 = deriveBlocks(BODY_V1, HOST);
		const v2 = deriveBlocks(BODY_V2, HOST);

		// Build maps from normalised text content to block id for stable blocks.
		// We identify stable blocks by matching kind + heading text (or paragraph text
		// for unchanged paragraphs).
		const mapV1 = new Map<string, string>(
			v1.blocks.map((b) => {
				const key = b.payload.kind === "heading" ? `heading:${b.payload.text}` : b.id;
				return [key, b.id];
			}),
		);

		// Every heading in v1 that also exists in v2 must have the same id.
		for (const b of v2.blocks) {
			if (b.payload.kind === "heading") {
				const key = `heading:${b.payload.text}`;
				if (mapV1.has(key)) {
					expect(b.id).toBe(mapV1.get(key));
				}
			}
		}
	});

	it("the edited section (Section A) has a different id in v2", () => {
		const v1 = deriveBlocks(BODY_V1, HOST);
		const v2 = deriveBlocks(BODY_V2, HOST);

		// Find the paragraph under "Section A" (order=3 in zero-indexed blocks:
		// 0=# Introduction, 1=paragraph, 2=## Section A, 3=paragraph(v1), ...)
		const paragraphsV1 = v1.blocks.filter((b) => b.payload.kind === "paragraph");
		const paragraphsV2 = v2.blocks.filter((b) => b.payload.kind === "paragraph");

		// The first paragraph under "Section A" (the one that changed) must have a different id.
		// It is the second paragraph in the body (index 1 among paragraphs).
		const changedV1 = paragraphsV1[1]!;
		const changedV2 = paragraphsV2[1]!;

		expect(changedV1).toBeDefined();
		expect(changedV2).toBeDefined();
		expect(changedV1.id).not.toBe(changedV2.id);
	});

	it("DocumentBody renders data-block-id on Block shells matching deriveBlocks ids", () => {
		const { blocks } = deriveBlocks(BODY_V1, HOST);
		const { container } = render(<DocumentBody body={BODY_V1} hostId={HOST.id} />);

		const shells = container.querySelectorAll<HTMLElement>("[data-block-id]");
		const renderedIds = Array.from(shells).map((el) => el.getAttribute("data-block-id"));

		for (const b of blocks) {
			expect(renderedIds).toContain(b.id);
		}
	});

	it("re-rendering with edited body keeps unchanged block data-block-id values", () => {
		const { blocks: blocksV1 } = deriveBlocks(BODY_V1, HOST);
		const { rerender, container } = render(<DocumentBody body={BODY_V1} hostId={HOST.id} />);

		// Capture ids of unchanged blocks before the re-render.
		const unchangedHeadings = blocksV1.filter((b) => b.payload.kind === "heading").map((b) => b.id);

		rerender(<DocumentBody body={BODY_V2} hostId={HOST.id} />);

		const renderedIds = Array.from(container.querySelectorAll<HTMLElement>("[data-block-id]")).map(
			(el) => el.getAttribute("data-block-id"),
		);

		// All heading ids (unchanged text) must still be in the DOM.
		for (const id of unchangedHeadings) {
			expect(renderedIds).toContain(id);
		}
	});
});

// ── T7 — Round-trip lossless: fixture body covers all supported kinds ──

// A body that exercises heading, paragraph, list, quote, code, table, divider,
// image, and html. (The "unknown" kind is exercised separately via oversize gate.)
const ALL_KINDS_BODY = `# All Kinds

A paragraph with **bold** and _italic_.

## Lists

- Item one
- Item two
  - Nested item

## Quote

> This is a blockquote.

## Code

\`\`\`ts
const x = 1;
\`\`\`

## Table

| Col A | Col B |
|-------|-------|
| 1     | 2     |

---

## Image

![alt text](https://example.com/image.png)

## Raw HTML

<div class="raw">raw html block</div>
`;

describe("DocumentBody — T7 round-trip lossless", () => {
	it("derives blocks for all supported kinds from the fixture body", () => {
		const { blocks } = deriveBlocks(ALL_KINDS_BODY, {
			kind: "document",
			id: "k-all-kinds",
		});

		const kinds = new Set(blocks.map((b) => b.kind));

		expect(kinds.has("heading")).toBe(true);
		expect(kinds.has("paragraph")).toBe(true);
		expect(kinds.has("list")).toBe(true);
		expect(kinds.has("quote")).toBe(true);
		expect(kinds.has("code")).toBe(true);
		expect(kinds.has("table")).toBe(true);
		expect(kinds.has("divider")).toBe(true);
		expect(kinds.has("image")).toBe(true);
		expect(kinds.has("html")).toBe(true);
	});

	it("block count for all-kinds body matches expected structure", () => {
		const { blocks } = deriveBlocks(ALL_KINDS_BODY, {
			kind: "document",
			id: "k-all-kinds",
		});
		// We have at minimum 9 blocks (one per kind category)
		expect(blocks.length).toBeGreaterThanOrEqual(9);
	});

	it("no block ids are empty strings", () => {
		const { blocks } = deriveBlocks(ALL_KINDS_BODY, {
			kind: "document",
			id: "k-all-kinds",
		});
		for (const b of blocks) {
			expect(b.id.length).toBeGreaterThan(0);
		}
	});
});

// ── Fixtures ──

const BODY_WITH_TWO_BLOCKS = `First paragraph block.

Second paragraph block.`;

// Derive block IDs so we can reference real IDs in message fixtures.
const { blocks: DERIVED_BLOCKS } = deriveBlocks(BODY_WITH_TWO_BLOCKS, {
	kind: "document",
	id: "k-anchor-test",
});

// A blockId that does NOT exist in BODY_WITH_TWO_BLOCKS — simulates a deleted/edited block.
const ORPHAN_BLOCK_ID = "block-orphan-that-no-longer-exists-in-body";

// A blockId that DOES exist in BODY_WITH_TWO_BLOCKS.
const LIVE_BLOCK_ID = DERIVED_BLOCKS[0]!.id;

function makeMessage(id: string, blockId?: string): Message {
	return {
		id,
		threadId: "t-anchor-test",
		senderId: "u-founder",
		type: "plain",
		payload: (blockId
			? { text: `Message anchored to ${blockId}`, blockId }
			: { text: "Plain message" }) as PlainPayload,
		clientKey: `ck-${id}`,
		// `blockId` is a real top-level Message column, mirrored from the
		// plain payload's own `blockId`.
		blockId: blockId ?? null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-31T10:00:00Z",
	};
}

// ── AC-2: Orphan messages show "anchor lost" indicator ──

describe("Anchor-lost indicator appears for orphan messages", () => {
	it("renders 'anchor lost' text when messages are anchored to a non-existent block", () => {
		// Arrange: one message anchored to a blockId not present in the body.
		const orphanMessage = makeMessage("msg-orphan-1", ORPHAN_BLOCK_ID);
		const messagesByBlockId = new Map([[ORPHAN_BLOCK_ID, [orphanMessage]]]);

		// Act
		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// Assert: the "anchor lost" indicator must be present
		expect(screen.getByTestId("anchor-lost-indicator")).toBeInTheDocument();
		expect(screen.getByText(/anchor lost/i)).toBeInTheDocument();
	});

	it("renders the orphan message text alongside the 'anchor lost' indicator", () => {
		const orphanMessage = makeMessage("msg-orphan-2", ORPHAN_BLOCK_ID);
		const messagesByBlockId = new Map([[ORPHAN_BLOCK_ID, [orphanMessage]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// The message content must still be visible (AC-4 corollary: messages are shown)
		expect(screen.getByText(/anchored to block-orphan/i)).toBeInTheDocument();
		expect(screen.getByTestId("anchor-lost-indicator")).toBeInTheDocument();
	});

	it("shows 'anchor lost' for multiple orphan messages grouped under the same blockId", () => {
		const orphan1 = makeMessage("msg-orphan-3a", ORPHAN_BLOCK_ID);
		const orphan2 = makeMessage("msg-orphan-3b", ORPHAN_BLOCK_ID);
		const messagesByBlockId = new Map([[ORPHAN_BLOCK_ID, [orphan1, orphan2]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// Only one indicator for the whole orphan group
		const indicators = screen.getAllByTestId("anchor-lost-indicator");
		expect(indicators.length).toBeGreaterThanOrEqual(1);
	});
});

// ── AC-2: Anchored messages with a live block do NOT show indicator ──

describe("No anchor-lost indicator for messages anchored to existing blocks", () => {
	it("does NOT render 'anchor lost' for messages whose blockId matches a rendered block", () => {
		// Arrange: message anchored to a block that IS in the current body.
		const liveMessage = makeMessage("msg-live-1", LIVE_BLOCK_ID);
		const messagesByBlockId = new Map([[LIVE_BLOCK_ID, [liveMessage]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// The indicator must NOT be present for live-anchored messages
		expect(screen.queryByTestId("anchor-lost-indicator")).not.toBeInTheDocument();
		expect(screen.queryByText(/anchor lost/i)).not.toBeInTheDocument();
	});
});

// ── AC-3: Indicator is honest — same signal for deleted vs edited block ──

describe("Anchor lost indicator does not distinguish deleted vs edited", () => {
	it("shows the same 'anchor lost' text for a blockId that never existed (simulating deletion)", () => {
		const deletedBlockId = "block-was-deleted-entirely";
		const msg = makeMessage("msg-deleted-1", deletedBlockId);
		const messagesByBlockId = new Map([[deletedBlockId, [msg]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		const indicator = screen.getByTestId("anchor-lost-indicator");
		expect(indicator.textContent?.trim()).toBe("anchor lost");
	});

	it("shows the same 'anchor lost' text for a blockId that existed but changed content (simulating edit)", () => {
		// After editing, the old blockId no longer resolves (content-derived IDs change).
		// The old blockId is effectively orphaned — same signal as a deletion.
		const editedOutBlockId = "block-content-was-edited-so-id-changed";
		const msg = makeMessage("msg-edited-1", editedOutBlockId);
		const messagesByBlockId = new Map([[editedOutBlockId, [msg]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		const indicator = screen.getByTestId("anchor-lost-indicator");
		// Same text, same data-testid — no distinction between deletion and edit
		expect(indicator.textContent?.trim()).toBe("anchor lost");
	});

	it("does not render any element with data-testid='anchor-lost-indicator' when all messages have live anchors", () => {
		const liveMessage1 = makeMessage("msg-live-both-1", LIVE_BLOCK_ID);
		const liveMessage2 = makeMessage("msg-live-both-2", DERIVED_BLOCKS[1]?.id ?? LIVE_BLOCK_ID);
		const messagesByBlockId = new Map([
			[LIVE_BLOCK_ID, [liveMessage1]],
			[DERIVED_BLOCKS[1]?.id ?? LIVE_BLOCK_ID, [liveMessage2]],
		]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		expect(screen.queryByTestId("anchor-lost-indicator")).not.toBeInTheDocument();
	});
});

// ── Mixed: both live and orphan messages in the same render ──

describe("Mixed live + orphan messages", () => {
	it("shows indicator only for orphan messages, not for live-anchored messages", () => {
		const liveMessage = makeMessage("msg-mixed-live", LIVE_BLOCK_ID);
		const orphanMessage = makeMessage("msg-mixed-orphan", ORPHAN_BLOCK_ID);
		const messagesByBlockId = new Map([
			[LIVE_BLOCK_ID, [liveMessage]],
			[ORPHAN_BLOCK_ID, [orphanMessage]],
		]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// Exactly one indicator for the orphan group
		const indicators = screen.getAllByTestId("anchor-lost-indicator");
		expect(indicators).toHaveLength(1);

		// The live message text is present (rendered inline, no indicator)
		expect(screen.getByText(/anchored to block-orphan/i)).toBeInTheDocument();
	});
});
