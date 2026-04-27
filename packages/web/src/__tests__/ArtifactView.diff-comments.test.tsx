/**
 * L6 — TextDiffView gutter "+ Comment" affordance (red phase).
 *
 * Plan ref: `.plan-L6.md` § 3.3:
 *   "Each line wrapped in a relative-positioned row. On hover (or focus-within
 *    for keyboard), render an absolutely-positioned `+ Comment` button on the
 *    gutter (left side, --touch-min height, btn-xs ghost). aria-label='Add
 *    comment to line N'. Clicking calls onAddComment(lineKey, lineIndex,
 *    lineText). lineKey = `${hunkHeader}:${liInsideHunk}`."
 *
 * These tests MUST fail today: TextDiffView has no `onAddComment` prop and
 * no per-line gutter affordance.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactViewProps } from "../shell/ArtifactView";
import { ArtifactView } from "../shell/ArtifactView";

function diffArtifact(
	onAddComment?: (lineKey: string, lineIndex: number, preview: string) => void,
) {
	const props: ArtifactViewProps = {
		shape: "text_diff",
		data: {
			hunks: [
				{
					header: "@@ -1,3 +1,5 @@",
					lines: [
						{ type: "context", content: "import { Hono } from 'hono';" },
						{ type: "addition", content: "import { jwt } from 'hono/jwt';" },
						{ type: "addition", content: "import { authMiddleware } from './auth';" },
						{ type: "context", content: "" },
						{ type: "deletion", content: "// TODO: add auth" },
					],
				},
			],
		},
		// new optional prop wired via type union (will type-error today)
		onAddComment,
	} as ArtifactViewProps;
	return props;
}

describe("ArtifactView (L6) — text_diff gutter + Comment affordance", () => {
	it("does not render '+ Comment' buttons when onAddComment is omitted", () => {
		render(<ArtifactView {...diffArtifact()} />);
		expect(screen.queryByRole("button", { name: /add comment to line/i })).toBeNull();
	});

	it("renders one '+ Comment' button per non-context-empty diff line when onAddComment is provided", () => {
		const handler = vi.fn();
		render(<ArtifactView {...diffArtifact(handler)} />);
		// 5 lines × 1 affordance each = 5 add-comment buttons in the DOM (some hidden until hover/focus).
		const buttons = screen.getAllByRole("button", { name: /add comment to line/i });
		expect(buttons.length).toBe(5);
	});

	it("clicking a gutter affordance fires onAddComment with stable lineKey and lineIndex", () => {
		const handler = vi.fn();
		render(<ArtifactView {...diffArtifact(handler)} />);
		const buttons = screen.getAllByRole("button", { name: /add comment to line/i });
		// Click the second line's affordance (lineIndex=1, the first jwt addition).
		fireEvent.click(buttons[1]);
		expect(handler).toHaveBeenCalledTimes(1);
		const [lineKey, lineIndex, preview] = handler.mock.calls[0];
		// lineKey contract: `${hunkHeader}:${lineIndex}` per .plan-L6.md § 3.3
		expect(lineKey).toBe("@@ -1,3 +1,5 @@:1");
		expect(lineIndex).toBe(1);
		expect(preview).toContain("jwt");
	});

	it("each gutter button has aria-label 'Add comment to line N'", () => {
		const handler = vi.fn();
		render(<ArtifactView {...diffArtifact(handler)} />);
		// Looking for at least one with the explicit pattern.
		const button = screen.getByRole("button", { name: /add comment to line 1/i });
		expect(button).toBeInTheDocument();
	});
});
