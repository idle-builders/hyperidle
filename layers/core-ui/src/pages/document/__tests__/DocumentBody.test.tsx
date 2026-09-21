/**
 * L23 — DocumentBody component tests (red phase).
 *
 * Covers T1–T5 and T-SEC-1 (XSS defence cases a–f).
 * DocumentBody does not exist yet — all tests will fail until Phase B.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// @lore L23 red-phase: DocumentBody does not yet exist. We import it now so
// these tests fail with "Cannot find module" rather than a silent skip.
// The architecture plan prescribes this deferred import pattern for the red phase.
import { DocumentBody } from "../DocumentBody";

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

	it("empty-state paragraph has muted colour class (text-[var(--text-tertiary)])", () => {
		// @lore U11: Updated from --text-lo to --text-tertiary (Hearth token migration).
		render(<DocumentBody body="" hostId="k-empty" />);
		const p = screen.getByText("(no content yet)");
		expect(p.className).toContain("text-[var(--text-tertiary)]");
	});

	it("renders a wrapper with data-knowledge-body attribute", () => {
		const { container } = render(<DocumentBody body="" hostId="k-empty" />);
		// Even empty bodies get the wrapper so the testId selector resolves
		expect(container.querySelector("[data-knowledge-body]")).toBeInTheDocument();
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

	it("body container has no card/border class (no card, no bordered, no shadow)", () => {
		const { container } = render(<DocumentBody body={THREE_SENTENCE_BODY} hostId="k1" />);
		const wrapper = container.querySelector("[data-knowledge-body]") as HTMLElement;
		expect(wrapper).toBeInTheDocument();
		// Must not have DaisyUI card or border utilities that add visual chrome
		expect(wrapper.className).not.toContain("card");
		expect(wrapper.className).not.toContain("border");
		expect(wrapper.className).not.toContain("shadow");
	});

	it("body wrapper has flex flex-col layout", () => {
		const { container } = render(<DocumentBody body={THREE_SENTENCE_BODY} hostId="k1" />);
		const wrapper = container.querySelector("[data-knowledge-body]") as HTMLElement;
		expect(wrapper.className).toContain("flex");
		expect(wrapper.className).toContain("flex-col");
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
		const { rerender } = render(
			<DocumentBody body="Initial paragraph content." hostId="k-memo" />,
		);
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
