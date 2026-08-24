// AZ6 — a prose artifact renders as content, and the panel around it contributes
// surface only. The inheritance half of that claim (computed text-transform on the
// rendered heading) only exists in a real browser and lives in the e2e spec; what
// runs here is the structural half: the panel does not declare content typography.

// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ArtifactPreviewSurface } from "../ArtifactPreviewSurface.js";
import { composeArtifactBody } from "../kinds/compose-artifact-body.js";

afterEach(cleanup);

/** Stand-in for the app-injected sanitiser; the real one is DOMPurify. */
const passthrough = (raw: string): string => raw;

const DOCUMENT_BODY = `# Q3 pricing decision

We recommend moving the Pro tier from **$29** to **$39**/month.

## Why

- Churn at $29 is 4.1%.
- Two competitors sit above $35.

| Tier | Now | Proposed |
| --- | --- | --- |
| Pro | $29 | $39 |

<details><summary>Raw model output</summary>elasticity = -0.42</details>

\`\`\`ts
const proposed = base * 1.34;
\`\`\`
`;

describe("a prose artifact renders as content", () => {
	it("renders headings, lists, tables and code as elements, not as source text", () => {
		const { container } = render(
			<>{composeArtifactBody("text", { kind: "text", body: DOCUMENT_BODY }, passthrough)}</>,
		);
		expect(container.querySelector("h1")).toBeTruthy();
		expect(container.querySelector("ul")).toBeTruthy();
		expect(container.querySelector("table")).toBeTruthy();
		expect(container.querySelector("pre")).toBeTruthy();
	});

	it("keeps the author's letter case in the DOM", () => {
		const { container } = render(
			<>{composeArtifactBody("text", { kind: "text", body: DOCUMENT_BODY }, passthrough)}</>,
		);
		expect(container.querySelector("h1")?.textContent).toBe("Q3 pricing decision");
	});

	it("shows no unknown-block stripe for markup the product allows", () => {
		const { container } = render(
			<>{composeArtifactBody("text", { kind: "text", body: DOCUMENT_BODY }, passthrough)}</>,
		);
		expect(container.querySelectorAll("[data-block-unknown-pill]")).toHaveLength(0);
	});

	it("renders embedded HTML through the sanitiser instead of dropping it", () => {
		const { container } = render(
			<>{composeArtifactBody("text", { kind: "text", body: DOCUMENT_BODY }, passthrough)}</>,
		);
		expect(container.querySelector("details")).toBeTruthy();
	});

	// A class-name assertion is NOT enough here: `list-disc` sat on the element and
	// resolved to `list-style-type: none` in the running app, because no class used
	// only inside the design-system package is generated (see the lore in
	// ListPayload). The marker is asserted as the style the element actually
	// carries, and again as a computed value in AZ6-artifact-content.spec.ts.
	it("gives list items visible markers", () => {
		const { container } = render(
			<>{composeArtifactBody("text", { kind: "text", body: DOCUMENT_BODY }, passthrough)}</>,
		);
		expect(container.querySelector("ul")?.style.listStyleType).toBe("disc");
	});

	it("gives ordered list items numbers", () => {
		const { container } = render(
			<>
				{composeArtifactBody("text", { kind: "text", body: "1. first\n2. second\n" }, passthrough)}
			</>,
		);
		expect(container.querySelector("ol")?.style.listStyleType).toBe("decimal");
	});
});

describe("preview chrome does not restyle the content it wraps", () => {
	const FORBIDDEN = [
		"uppercase",
		"lowercase",
		"capitalize",
		"font-mono",
		"justify-center",
		"text-center",
		"tracking-[var(--tracking-caps-sm)]",
		"text-[var(--text-tertiary)]",
		"text-[11px]",
	];

	it("declares no typographic class on the element that wraps full-size content", () => {
		const { container } = render(
			<ArtifactPreviewSurface
				kind="text"
				preview={{ kind: "text", body: DOCUMENT_BODY }}
				size="full"
				sanitizeHtml={passthrough}
			/>,
		);
		const surface = container.querySelector("[data-ds-component='ArtifactPreviewSurface']");
		const className = surface?.className ?? "";
		for (const token of FORBIDDEN) {
			expect(className).not.toContain(token);
		}
	});

	it("still paints a surface — the fix removes typography, not the panel", () => {
		const { container } = render(
			<ArtifactPreviewSurface
				kind="text"
				preview={{ kind: "text", body: DOCUMENT_BODY }}
				size="full"
				sanitizeHtml={passthrough}
			/>,
		);
		const className =
			container.querySelector("[data-ds-component='ArtifactPreviewSurface']")?.className ?? "";
		expect(className).toContain("bg-[var(--surface-container)]");
	});

	it("keeps the caption treatment where it belongs — on the caption", () => {
		const { container } = render(
			<ArtifactPreviewSurface kind="text" preview={null} size="gallery" />,
		);
		// The gallery placeholder consumes the complete monospace data profile…
		expect(container.textContent).toContain("No preview");
		const caption = container.querySelector("[data-artifact-caption]");
		expect(caption?.className ?? "").toContain("type-data");
		// …but the panel itself no longer imposes it.
		const surface = container.querySelector("[data-ds-component='ArtifactPreviewSurface']");
		expect(surface?.className ?? "").not.toContain("type-data");
	});
});
