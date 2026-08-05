/**
 * L23 — KnowledgeBody block-id stability tests (red phase).
 *
 * T6: Editing one section does not change other sections' block ids.
 * T7: Round-trip — deriveBlocks on a fixture body covers all supported kinds.
 *
 * These are pure exercises of deriveBlocks (no React rendering required for T6/T7).
 * T6 also tests that KnowledgeBody passes block.id as the React key (tested
 * via data-block-id attributes emitted by Block.tsx:108).
 */

import { deriveBlocks } from "@hyperidle/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KnowledgeBody } from "../KnowledgeBody";

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

const HOST = { kind: "knowledge_item" as const, id: "k-stability" };

describe("KnowledgeBody — T6 block-id stability", () => {
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

	it("KnowledgeBody renders data-block-id on Block shells matching deriveBlocks ids", () => {
		const { blocks } = deriveBlocks(BODY_V1, HOST);
		const { container } = render(<KnowledgeBody body={BODY_V1} hostId={HOST.id} />);

		const shells = container.querySelectorAll<HTMLElement>("[data-block-id]");
		const renderedIds = Array.from(shells).map((el) => el.getAttribute("data-block-id"));

		for (const b of blocks) {
			expect(renderedIds).toContain(b.id);
		}
	});

	it("re-rendering with edited body keeps unchanged block data-block-id values", () => {
		const { blocks: blocksV1 } = deriveBlocks(BODY_V1, HOST);
		const { rerender, container } = render(<KnowledgeBody body={BODY_V1} hostId={HOST.id} />);

		// Capture ids of unchanged blocks before the re-render.
		const unchangedHeadings = blocksV1.filter((b) => b.payload.kind === "heading").map((b) => b.id);

		rerender(<KnowledgeBody body={BODY_V2} hostId={HOST.id} />);

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

describe("KnowledgeBody — T7 round-trip lossless", () => {
	it("derives blocks for all supported kinds from the fixture body", () => {
		const { blocks } = deriveBlocks(ALL_KINDS_BODY, {
			kind: "knowledge_item",
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
			kind: "knowledge_item",
			id: "k-all-kinds",
		});
		// We have at minimum 9 blocks (one per kind category)
		expect(blocks.length).toBeGreaterThanOrEqual(9);
	});

	it("no block ids are empty strings", () => {
		const { blocks } = deriveBlocks(ALL_KINDS_BODY, {
			kind: "knowledge_item",
			id: "k-all-kinds",
		});
		for (const b of blocks) {
			expect(b.id.length).toBeGreaterThan(0);
		}
	});
});
