/**
 * KnowledgeCreateDialog — T2 tests.
 *
 * Covers:
 *   - Dialog body field uses BodyEditor (not textarea)
 *   - Editor is disabled during submission (editable=false when submitting)
 *
 * BodyEditor is mocked (same reason as KnowledgeDetail.edit.test.tsx —
 * TipTap requires DOM APIs unavailable in JSDOM).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeCreateDialog } from "../pages/knowledge/KnowledgeCreateDialog";

// Mock BodyEditor
vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/design-system")>();
	return {
		...original,
		BodyEditor: ({
			initialContent,
			onChange,
			editable,
		}: {
			initialContent: string;
			onChange: (md: string) => void;
			editable?: boolean;
		}) => (
			<div data-testid="mock-body-editor" data-editable={editable !== false ? "true" : "false"}>
				<textarea
					data-testid="body-editor-textarea"
					defaultValue={initialContent}
					onChange={(e) => onChange(e.target.value)}
					aria-label="Body editor"
				/>
			</div>
		),
	};
});

// Mock apiFetch for submission
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// Mock useCurrentUser
vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "user-1" } }),
}));

// AD3: KnowledgeCreateDialog now calls useTeams to detect single-team mode.
// Mock with 2 teams so multi-team path (all 7 scopes) is exercised here —
// the AD3-KnowledgeCreateDialog-scope.test.tsx covers single-team behaviour.
vi.mock("../hooks/useTeams.js", () => ({
	useTeams: () => ({
		data: {
			teams: [
				{
					id: "t1",
					name: "Alpha",
					phase: "build",
					status: "healthy",
					leadAgentId: null,
					activeBets: 0,
					shipped: 0,
					shipRate: "0%",
					progress: { done: 0, total: 0 },
				},
				{
					id: "t2",
					name: "Beta",
					phase: "build",
					status: "healthy",
					leadAgentId: null,
					activeBets: 0,
					shipped: 0,
					shipRate: "0%",
					progress: { done: 0, total: 0 },
				},
			],
		},
		loading: false,
		error: null,
	}),
}));

function renderDialog(
	props: Partial<{
		open: boolean;
		onClose: () => void;
		onCreated: () => void;
	}> = {},
): ReturnType<typeof render> {
	const defaults = {
		open: true,
		onClose: vi.fn(),
		onCreated: vi.fn(),
	};
	return render(<KnowledgeCreateDialog {...defaults} {...props} />);
}

describe("KnowledgeCreateDialog — T2 body field", () => {
	it("dialog body field uses BodyEditor (not a plain textarea)", () => {
		renderDialog();
		// BodyEditor mock should be present
		expect(screen.getByTestId("mock-body-editor")).toBeInTheDocument();
		// Plain textarea with class textarea-bordered must NOT be present
		// (the old Q2 textarea had class "textarea textarea-bordered text-base resize-none h-32 w-full")
		const textareas = screen.getAllByRole("textbox");
		// The body-editor-textarea (from mock) will be present, but no other textareas for body
		// The title input is not a textarea, so the only textarea is inside the mock
		const nonEditorTextareas = textareas.filter(
			(el) => el.getAttribute("data-testid") !== "body-editor-textarea",
		);
		// There should be no raw plain body textarea outside BodyEditor
		const plainBodyTextarea = nonEditorTextareas.find(
			(el) => el.tagName === "TEXTAREA" && !el.closest("[data-testid='mock-body-editor']"),
		);
		expect(plainBodyTextarea).toBeUndefined();
	});

	it("editor is disabled (editable=false) during form submission", async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		const fetchSpy = vi.mocked(apiFetch);
		// Never resolves — keeps submitting=true
		fetchSpy.mockImplementation(() => new Promise(() => {}));

		const user = userEvent.setup();
		renderDialog();

		// Fill in title
		const titleInput = screen.getByPlaceholderText(/what did you learn/i);
		await user.type(titleInput, "Test Knowledge Item");

		// Fill in body via mock editor
		const editorTextarea = screen.getByTestId("body-editor-textarea");
		await user.clear(editorTextarea);
		await user.type(editorTextarea, "Some body text");

		// Click Create
		const createButton = screen.getByRole("button", { name: /create/i });
		await user.click(createButton);

		// During submission, editable should be false
		await waitFor(() => {
			const bodyEditor = screen.getByTestId("mock-body-editor");
			expect(bodyEditor.getAttribute("data-editable")).toBe("false");
		});
	});
});
