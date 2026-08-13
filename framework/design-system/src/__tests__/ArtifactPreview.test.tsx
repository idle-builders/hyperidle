// @vitest-environment jsdom
// AE6 updated — Tier 2 layout: ArtifactPreview (single_full_preview).
// Protected: AC-9 — placeholder "PREVIEW NOT YET RENDERED" + no fake thumbnail.
// @lore AE6: kind widened to string; fixture now uses 6 fundamental kinds.

import type { Artifact } from "@hyperidle/domain-model";
import { ARTIFACT_KINDS } from "@hyperidle/domain-model";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactPreview } from "../ArtifactPreview.js";

// @lore AZ6: a full-size preview now requires the app's HTML sanitiser at the type
// level — a missing one used to degrade silently to the unknown-block stripe.
const passthrough = (raw: string): string => raw;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fixture(
	kind: string,
	preview: Artifact["preview"] = null,
	label?: string | null,
): Artifact {
	return {
		id: "x",
		producingTaskId: "t",
		producingTaskTitle: "Task title",
		kind,
		label: label ?? null,
		preview,
		threadCount: 0,
		createdAt: "2026-04-28T00:00:00.000Z",
	};
}

describe("ArtifactPreview (single_full_preview)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders the kind badge and label in the meta row", () => {
		// @lore AE6: 'decision' mapped to 'text' + label='decision' (dropped).
		// Using 'text' kind with plain body content for this test.
		act(() => {
			root.render(
				createElement(ArtifactPreview, {
					sanitizeHtml: passthrough,
					showTitle: false,
					data: fixture(
						"text",
						{ kind: "text", body: "Ship X decision: proceed with PostgreSQL", format: "plain" },
						"decision",
					),
				}),
			);
		});
		expect(container.textContent).toContain("TEXT");
		expect(container.textContent).toContain("decision");
		expect(container.textContent?.match(/Task title/g)).toHaveLength(1);
	});

	// @lore AF16 T9: "PREVIEW NOT YET RENDERED" replaced with "No preview available" (full size).
	it("renders 'No preview available' when preview is null and no <img>", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreview, { sanitizeHtml: passthrough, data: fixture("image", null) }),
			);
		});
		expect(container.textContent).toContain("No preview available");
		expect(container.querySelector("img")).toBeNull();
	});

	it("does not render a discussion area by default (slot empty)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreview, { sanitizeHtml: passthrough, data: fixture("text", null) }),
			);
		});
		expect(container.textContent).not.toContain("Reply...");
	});

	// Exhaustive-render smoke for all 6 fundamental kinds
	for (const kind of ARTIFACT_KINDS) {
		it(`renders without throwing for kind '${kind}' (no preview)`, () => {
			act(() => {
				root.render(
					createElement(ArtifactPreview, { sanitizeHtml: passthrough, data: fixture(kind, null) }),
				);
			});
			expect(container.firstElementChild).toBeTruthy();
		});
	}
});
