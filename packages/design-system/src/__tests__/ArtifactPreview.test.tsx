// @vitest-environment jsdom
// L3 RED — Tier 2 layout: ArtifactPreview (single_full_preview).
// Protected: AC-9 — placeholder "PREVIEW NOT YET RENDERED" + no fake thumbnail.

import type { Artifact, ArtifactKind } from "@hyperidle/shared";
import { ARTIFACT_KINDS } from "@hyperidle/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactPreview } from "../ArtifactPreview.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fixture(kind: ArtifactKind, preview: Artifact["preview"] = null): Artifact {
	return {
		id: "x",
		producingTaskId: "t",
		producingTaskTitle: "Task title",
		kind,
		preview,
		cost: { money: "$0.42", tokens: "12.4k" },
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

	it("renders the meta row + body", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreview, {
					data: fixture("decision", { kind: "decision", claim: "Ship X", rationale: "y" }),
				}),
			);
		});
		expect(container.textContent).toContain("DECISION");
		expect(container.textContent).toContain("Ship X");
	});

	// Protected: PREVIEW NOT YET RENDERED + no fake thumbnail
	it("renders 'PREVIEW NOT YET RENDERED' when preview is null and no <img>", () => {
		act(() => {
			root.render(createElement(ArtifactPreview, { data: fixture("design", null) }));
		});
		expect(container.textContent).toContain("PREVIEW NOT YET RENDERED");
		expect(container.querySelector("img")).toBeNull();
	});

	it("does not render a discussion area by default (slot empty)", () => {
		act(() => {
			root.render(createElement(ArtifactPreview, { data: fixture("decision", null) }));
		});
		// No L1 thread surface yet — the slot's empty rendering must not include
		// any threading placeholder text that would suggest a fabricated UI.
		expect(container.textContent).not.toContain("Reply...");
	});

	// Exhaustive-render smoke for all 12 recognised kinds
	for (const kind of ARTIFACT_KINDS.filter((k) => k !== "unknown_kind")) {
		it(`renders without throwing for kind '${kind}' (no preview)`, () => {
			act(() => {
				root.render(createElement(ArtifactPreview, { data: fixture(kind as ArtifactKind, null) }));
			});
			expect(container.firstElementChild).toBeTruthy();
		});
	}
});
