/**
 * AC3 — KnowledgeBody: sole fenced html block renders in the AZ6 sandbox frame.
 *
 * (a) Sole ```html block → ArtifactFrame (data-artifact-frame present), source byte-identical.
 * (b) Fenced html block among other blocks → code listing, NOT the frame.
 * (c) Body with no html → unchanged behaviour.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildArtifactSrcdoc } from "../../../ds/artifact-frame/build-srcdoc.js";
import { KnowledgeBody } from "../KnowledgeBody.js";

// ── (a) Sole fenced html block → runs in ArtifactFrame ──────────────────────

// Trailing newline is stripped by the markdown parser; the fence itself is not included.
const SOLE_HTML_TEXT = "<h1>Hello</h1>\n<p>World</p>";
const SOLE_HTML_BODY = `\`\`\`html\n${SOLE_HTML_TEXT}\n\`\`\``;

describe("KnowledgeBody — sole fenced html block renders in ArtifactFrame", () => {
	it("renders an iframe with data-artifact-frame attribute", () => {
		const { container } = render(<KnowledgeBody body={SOLE_HTML_BODY} hostId="k-html" />);
		expect(container.querySelector("[data-artifact-frame]")).toBeInTheDocument();
	});

	it("does not render a code-kind Block shell when body is a sole fenced html block", () => {
		const { container } = render(<KnowledgeBody body={SOLE_HTML_BODY} hostId="k-html" />);
		// A code block from the regular listing would carry data-ds-kind=code.
		expect(
			container.querySelector('[data-ds-component="block"][data-ds-kind="code"]'),
		).not.toBeInTheDocument();
	});

	it("source is byte-identical: iframe srcdoc equals buildArtifactSrcdoc of the fence text", () => {
		const { container } = render(<KnowledgeBody body={SOLE_HTML_BODY} hostId="k-html" />);
		const iframe = container.querySelector("[data-artifact-frame]") as HTMLIFrameElement;
		expect(iframe).toBeInTheDocument();
		// srcdoc is set via the React srcDoc prop — jsdom reflects it on the DOM attribute.
		expect(iframe.srcdoc).toBe(buildArtifactSrcdoc(SOLE_HTML_TEXT));
	});

	it("passes documentTitle as the frame title when provided", () => {
		const { container } = render(
			<KnowledgeBody body={SOLE_HTML_BODY} hostId="k-html" documentTitle="My Doc" />,
		);
		const iframe = container.querySelector("[data-artifact-frame]") as HTMLIFrameElement;
		expect(iframe).toBeInTheDocument();
		// title attribute is set on the iframe element by ArtifactFrame
		expect(iframe.title).toBe("My Doc");
	});
});

// ── (b) Fenced html block among other blocks → stays a code listing ──────────

const MIXED_BODY = "Intro paragraph.\n\n```html\n<h1>Hello</h1>\n```\n\nOutro paragraph.";

describe("KnowledgeBody — fenced html block among other blocks stays a code listing", () => {
	it("does NOT render data-artifact-frame when html fence is not the sole block", () => {
		const { container } = render(<KnowledgeBody body={MIXED_BODY} hostId="k-mixed" />);
		expect(container.querySelector("[data-artifact-frame]")).not.toBeInTheDocument();
	});

	it("renders a code-kind Block for the html fence in a mixed body", () => {
		const { container } = render(<KnowledgeBody body={MIXED_BODY} hostId="k-mixed" />);
		expect(
			container.querySelector('[data-ds-component="block"][data-ds-kind="code"]'),
		).toBeInTheDocument();
	});

	it("renders paragraph blocks for the surrounding text in a mixed body", () => {
		render(<KnowledgeBody body={MIXED_BODY} hostId="k-mixed" />);
		expect(screen.getByText(/Intro paragraph/)).toBeInTheDocument();
		expect(screen.getByText(/Outro paragraph/)).toBeInTheDocument();
	});
});

// ── (c) Body with no html → unchanged behaviour ───────────────────────────────

// String constants with real newlines so fenced block syntax parses correctly.
// JSX attribute string literals do NOT interpret \n — must be in a JS expression or a constant.
const SOLE_TS_BODY = "```typescript\nconst x = 1;\n```";
const RAW_HTML_BODY = "<div>raw html</div>";

describe("KnowledgeBody — body with no html block is unchanged", () => {
	it("renders paragraph blocks without data-artifact-frame", () => {
		const { container } = render(<KnowledgeBody body="Hello world." hostId="k-plain" />);
		expect(container.querySelector("[data-artifact-frame]")).not.toBeInTheDocument();
		expect(
			container.querySelector('[data-ds-component="block"][data-ds-kind="paragraph"]'),
		).toBeInTheDocument();
	});

	it("a sole non-html fenced block does not render in the frame", () => {
		// A typescript fence should stay a code listing, not trigger the iframe path.
		const { container } = render(<KnowledgeBody body={SOLE_TS_BODY} hostId="k-ts" />);
		expect(container.querySelector("[data-artifact-frame]")).not.toBeInTheDocument();
		expect(
			container.querySelector('[data-ds-component="block"][data-ds-kind="code"]'),
		).toBeInTheDocument();
	});

	it("a sole html block with no lang tag does not render in the frame", () => {
		// A raw HTML block (mdast kind=html, not kind=code) must not trigger the iframe path.
		const { container } = render(<KnowledgeBody body={RAW_HTML_BODY} hostId="k-raw" />);
		expect(container.querySelector("[data-artifact-frame]")).not.toBeInTheDocument();
	});
});
