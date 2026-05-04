/**
 * L6 — RequestChangesComposer (red phase).
 *
 * Tests the standalone composer component contract from `.plan-L6.md` § 3.2:
 *   - open prop renders a role=dialog modal with summary input + buttons.
 *   - Submit disabled until summary non-empty (and no draft has empty body).
 *   - summary length capped at 140 chars (form-level enforcement).
 *   - Cmd/Ctrl+Enter submits when valid; Esc cancels; both stop propagation.
 *   - Cancel discards state and never invokes onSubmit.
 *   - Esc / Cmd+Enter only fire when composer focused (no double-fire on global handler).
 *
 * These tests MUST fail today: the component does not exist.
 */
import { REQUEST_CHANGES_SUMMARY_MAX } from "@hyperidle/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type InlineCommentDraft, RequestChangesComposer } from "../shell/RequestChangesComposer";

function defaultDrafts(): InlineCommentDraft[] {
	return [
		{
			lineKey: "@@ -1,3 +1,5 @@:1",
			lineIndex: 1,
			preview: "import { jwt } from 'hono/jwt';",
			body: "",
		},
	];
}

describe("RequestChangesComposer", () => {
	it("renders nothing when open=false", () => {
		render(
			<RequestChangesComposer
				open={false}
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("renders a role=dialog with summary textbox and Submit/Cancel buttons when open", () => {
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const dialog = screen.getByRole("dialog");
		expect(dialog).toBeInTheDocument();
		expect(within(dialog).getByRole("textbox", { name: /summary/i })).toBeInTheDocument();
		expect(within(dialog).getByRole("button", { name: /cancel/i })).toBeInTheDocument();
		expect(within(dialog).getByRole("button", { name: /submit/i })).toBeInTheDocument();
	});

	it("autofocuses the summary input when opened", () => {
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const summary = screen.getByRole("textbox", { name: /summary/i });
		expect(document.activeElement).toBe(summary);
	});

	it("disables Submit when summary is empty", () => {
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
	});

	it("enables Submit once summary has non-whitespace content", async () => {
		const user = userEvent.setup();
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const summary = screen.getByRole("textbox", { name: /summary/i });
		await user.type(summary, "tighten");
		expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled();
	});

	it("enforces the summary cap on the summary input", async () => {
		const user = userEvent.setup();
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const summary = screen.getByRole("textbox", { name: /summary/i }) as HTMLInputElement;
		// maxLength attribute is required by AC; verify both attribute and effective behavior.
		expect(Number(summary.getAttribute("maxlength"))).toBe(REQUEST_CHANGES_SUMMARY_MAX);
		await user.type(summary, "a".repeat(REQUEST_CHANGES_SUMMARY_MAX + 10));
		expect(summary.value.length).toBe(REQUEST_CHANGES_SUMMARY_MAX);
	});

	it("Cmd+Enter on the summary input submits with the typed payload", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={onSubmit}
				onCancel={vi.fn()}
			/>,
		);
		const summary = screen.getByRole("textbox", { name: /summary/i });
		await user.type(summary, "tighten the wording");
		fireEvent.keyDown(summary, { key: "Enter", metaKey: true });
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				summary: "tighten the wording",
				inlineComments: [],
			}),
		);
	});

	it("Ctrl+Enter on the summary input also submits (cross-platform)", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={onSubmit}
				onCancel={vi.fn()}
			/>,
		);
		const summary = screen.getByRole("textbox", { name: /summary/i });
		await user.type(summary, "fix it");
		fireEvent.keyDown(summary, { key: "Enter", ctrlKey: true });
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	it("Cmd+Enter does NOT submit when summary is empty", () => {
		const onSubmit = vi.fn();
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={onSubmit}
				onCancel={vi.fn()}
			/>,
		);
		const summary = screen.getByRole("textbox", { name: /summary/i });
		fireEvent.keyDown(summary, { key: "Enter", metaKey: true });
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("Esc on the dialog cancels (calls onCancel, not onSubmit)", () => {
		const onCancel = vi.fn();
		const onSubmit = vi.fn();
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={onSubmit}
				onCancel={onCancel}
			/>,
		);
		const dialog = screen.getByRole("dialog");
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("Cancel button calls onCancel and never onSubmit", async () => {
		const user = userEvent.setup();
		const onCancel = vi.fn();
		const onSubmit = vi.fn();
		render(
			<RequestChangesComposer
				open
				drafts={[]}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={onSubmit}
				onCancel={onCancel}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("renders one row per inline comment draft with line preview and body textarea", () => {
		render(
			<RequestChangesComposer
				open
				drafts={defaultDrafts()}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const rows = screen.getAllByTestId(/^inline-comment-row-/);
		expect(rows).toHaveLength(1);
		expect(within(rows[0]).getByText(/import \{ jwt \}/)).toBeInTheDocument();
		expect(within(rows[0]).getByRole("textbox", { name: /comment/i })).toBeInTheDocument();
	});

	it("submitting carries inline_comments[] (lineIndex + body) in the payload", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		const drafts: InlineCommentDraft[] = [
			{ lineKey: "h:0", lineIndex: 0, preview: "a", body: "rename" },
			{ lineKey: "h:2", lineIndex: 2, preview: "b", body: "null check" },
		];
		render(
			<RequestChangesComposer
				open
				drafts={drafts}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={onSubmit}
				onCancel={vi.fn()}
			/>,
		);
		const summary = screen.getByRole("textbox", { name: /summary/i });
		await user.type(summary, "fix");
		await user.click(screen.getByRole("button", { name: /submit/i }));
		expect(onSubmit).toHaveBeenCalledWith({
			summary: "fix",
			inlineComments: [
				{ lineIndex: 0, body: "rename" },
				{ lineIndex: 2, body: "null check" },
			],
		});
	});

	it("Submit is disabled when any inline draft has an empty body", async () => {
		const user = userEvent.setup();
		render(
			<RequestChangesComposer
				open
				drafts={defaultDrafts()}
				onChangeDraft={vi.fn()}
				onRemoveDraft={vi.fn()}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		await user.type(screen.getByRole("textbox", { name: /summary/i }), "fix");
		expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
	});
});
