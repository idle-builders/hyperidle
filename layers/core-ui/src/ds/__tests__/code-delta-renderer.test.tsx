// Tests for the DS (code,diff) core: CodeDeltaRenderer.

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// These imports will fail (red) until the diff/ module is created
import { CodeDeltaRenderer } from "../diff/code-delta-renderer.js";

afterEach(cleanup);

// Minimal CodeDelta fixture (local type, not shared)
const FIXTURE_DELTA = {
	file: "src/promo.ts",
	hunks: [
		{
			header: "@@ -1,3 +1,4 @@",
			lines: [
				{ kind: "ctx" as const, text: "const x = 1;" },
				{ kind: "del" as const, text: "const y = 2;" },
				{ kind: "add" as const, text: "const y = 3;" },
				{ kind: "add" as const, text: "const z = 4;" },
			],
		},
	],
};

describe("CodeDeltaRenderer (DS diff core)", () => {
	it("renders a section with hunk header and diff lines", () => {
		const { container } = render(<CodeDeltaRenderer delta={FIXTURE_DELTA} />);
		// hunk header text is present
		expect(screen.getByText("@@ -1,3 +1,4 @@")).toBeTruthy();
		// diff line text is present
		expect(screen.getByText("const x = 1;")).toBeTruthy();
		expect(screen.getByText("const y = 2;")).toBeTruthy();
		expect(screen.getByText("const y = 3;")).toBeTruthy();
		// data-diff-type attributes present
		const adds = container.querySelectorAll('[data-diff-type="add"]');
		const dels = container.querySelectorAll('[data-diff-type="del"]');
		expect(adds.length).toBeGreaterThanOrEqual(2);
		expect(dels.length).toBeGreaterThanOrEqual(1);
	});

	it("calls renderLineGutter slot for each line (slot seam)", () => {
		const slotRefs: Array<{ hunkIndex: number; lineIndex: number }> = [];
		render(
			<CodeDeltaRenderer
				delta={FIXTURE_DELTA}
				renderLineGutter={(ref) => {
					slotRefs.push({ hunkIndex: ref.hunkIndex, lineIndex: ref.lineIndex });
					return null;
				}}
			/>,
		);
		// 4 lines → 4 gutter slot calls
		expect(slotRefs).toHaveLength(4);
		expect(slotRefs[0]).toMatchObject({ hunkIndex: 0, lineIndex: 0 });
		expect(slotRefs[3]).toMatchObject({ hunkIndex: 0, lineIndex: 3 });
	});

	it("DiffLineRef carries hunkIndex, lineIndex, kind, text", () => {
		const refs: Array<import("../diff/code-delta-renderer.js").DiffLineRef> = [];
		render(
			<CodeDeltaRenderer
				delta={FIXTURE_DELTA}
				renderLineGutter={(ref) => {
					refs.push(ref);
					return null;
				}}
			/>,
		);
		expect(refs[1]).toMatchObject({
			hunkIndex: 0,
			lineIndex: 1,
			kind: "del",
			text: "const y = 2;",
		});
		expect(refs[2]).toMatchObject({
			hunkIndex: 0,
			lineIndex: 2,
			kind: "add",
			text: "const y = 3;",
		});
	});

	it("renders slot content below a line when renderLineBelow is provided", () => {
		render(
			<CodeDeltaRenderer
				delta={FIXTURE_DELTA}
				renderLineBelow={(ref) =>
					ref.kind === "add" ? <div data-testid={`below-line-${ref.lineIndex}`}>below</div> : null
				}
			/>,
		);
		// Two add lines should each have a below slot
		expect(screen.getAllByTestId(/below-line-/)).toHaveLength(2);
	});

	it("has no empty/no-changes/error state branch — a pure content renderer", () => {
		// Empty hunks renders without crash (the composition handles empty, not the primitive)
		const { container } = render(<CodeDeltaRenderer delta={{ file: "test.ts", hunks: [] }} />);
		// Section is present with no crash
		expect(container.querySelectorAll("pre")).toHaveLength(1);
	});
});
