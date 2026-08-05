/**
 * KnowledgeDetail — edit mode tests (T2 rewrite).
 *
 * The textarea+preview editing split and Save/Cancel buttons are replaced by:
 * - BodyEditor component (mocked — TipTap requires DOM APIs not in JSDOM)
 * - Done button to exit edit mode
 * - Auto-save via PATCH /api/knowledge/:id
 * - Save indicator ("Saving..." / "Saved")
 * - Conflict banner on 409 response
 *
 * BodyEditor is mocked so these page-level tests focus on wiring and state,
 * not on TipTap internals (which have their own tests in the design-system pkg).
 *
 * @lore T2: mock BodyEditor in page-level tests. TipTap/ProseMirror requires
 * real DOM APIs that JSDOM does not implement. The component's own tests run
 * in the design-system package with a proper DOM setup.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";

// Mock BodyEditor — TipTap does not work in JSDOM
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

// Mock apiFetch for auto-save tests
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

function renderPage(knowledgeId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail — T2 edit mode (BodyEditor + auto-save)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const { apiFetch } = await import("../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
		// Default: GET /api/knowledge/:id returns 404 (falls back to fixture)
		fetchSpy.mockResolvedValue(new Response("Not Found", { status: 404 }));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("shows the Edit button for a practice-scope item", () => {
		renderPage("k1");
		expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
	});

	it("enters edit mode and shows BodyEditor (not textarea) when Edit is clicked", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));

		// BodyEditor mock should be visible
		expect(screen.getByTestId("mock-body-editor")).toBeInTheDocument();

		// Old textarea and Save/Cancel must NOT be present
		expect(screen.queryByTestId("knowledge-edit-textarea")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
	});

	it("shows Done button in edit mode (not Save/Cancel)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));

		expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
	});

	it("Done button exits edit mode and shows read view", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("k1");

		await user.click(screen.getByRole("button", { name: /edit/i }));
		expect(screen.getByTestId("mock-body-editor")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /done/i }));

		// Back to read mode — editor gone
		expect(screen.queryByTestId("mock-body-editor")).not.toBeInTheDocument();
		// Knowledge body visible in read mode
		expect(screen.getByTestId("knowledge-body")).toBeInTheDocument();
	});

	it("shows save indicator 'Saving...' when auto-save is in flight", async () => {
		// First call = GET from useKnowledgeItem (returns 404 to fall back to fixture)
		// Subsequent PATCH calls never resolve — keeps saving state
		fetchSpy
			.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
			.mockImplementation(() => new Promise(() => {})); // PATCH never resolves

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));

		const editorTextarea = screen.getByTestId("body-editor-textarea");
		await user.clear(editorTextarea);
		await user.type(editorTextarea, "updated content");

		// Advance past debounce
		vi.advanceTimersByTime(1600);

		await waitFor(() => {
			expect(screen.getByTestId("save-indicator")).toHaveTextContent("Saving...");
		});
	});

	it("shows save indicator 'Saved' after successful auto-save", async () => {
		fetchSpy.mockImplementation((url: string) => {
			if (url.includes("/api/knowledge/k1")) {
				return Promise.resolve(new Response(JSON.stringify({ version: 2 }), { status: 200 }));
			}
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		});

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));

		const editorTextarea = screen.getByTestId("body-editor-textarea");
		await user.clear(editorTextarea);
		await user.type(editorTextarea, "updated content");

		vi.advanceTimersByTime(1600);

		await waitFor(() => {
			expect(screen.getByTestId("save-indicator")).toHaveTextContent("Saved");
		});
	});

	it("shows conflict banner when PATCH returns 409", async () => {
		const conflictResponse = JSON.stringify({
			error: "Version conflict",
			code: "CONFLICT",
			details: { currentVersion: 5 },
		});
		fetchSpy.mockImplementation((url: string) => {
			if (url.includes("/api/knowledge/k1")) {
				return Promise.resolve(new Response(conflictResponse, { status: 409 }));
			}
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		});

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));

		const editorTextarea = screen.getByTestId("body-editor-textarea");
		await user.clear(editorTextarea);
		await user.type(editorTextarea, "conflict content");

		vi.advanceTimersByTime(1600);

		await waitFor(() => {
			expect(screen.getByTestId("conflict-banner")).toBeInTheDocument();
			expect(screen.getByTestId("conflict-banner")).toHaveTextContent(/conflict/i);
		});
	});

	it("after auto-save + Done, read view shows the edited content (not the edit-start snapshot)", async () => {
		// F-ARCH-1 regression test: onSaved must use latestContentRef.current,
		// not the editContent state variable (which is the edit-start snapshot).
		fetchSpy.mockImplementation((url: string) => {
			if (url.includes("/api/knowledge/k1")) {
				return Promise.resolve(new Response(JSON.stringify({ version: 2 }), { status: 200 }));
			}
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		});

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("k1");

		// Enter edit mode
		await user.click(screen.getByRole("button", { name: /edit/i }));

		// Type new content into the mocked textarea
		const editorTextarea = screen.getByTestId("body-editor-textarea");
		await user.clear(editorTextarea);
		await user.type(editorTextarea, "brand new edited content");

		// Advance past debounce to trigger auto-save
		vi.advanceTimersByTime(1600);

		// Wait for Saved indicator to confirm onSaved fired
		await waitFor(() => {
			expect(screen.getByTestId("save-indicator")).toHaveTextContent("Saved");
		});

		// Click Done to exit edit mode
		await user.click(screen.getByRole("button", { name: /done/i }));

		// Read view must show the EDITED content, not the original fixture text
		const knowledgeBody = screen.getByTestId("knowledge-body");
		expect(knowledgeBody).toHaveTextContent("brand new edited content");
		expect(knowledgeBody).not.toHaveTextContent("JWT-based authentication");
	});

	it("factory items do NOT show an Edit button", () => {
		// k11 is factory-scope
		renderPage("k11");
		expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
	});

	it("read mode uses KnowledgeBody (blocks, not editor)", () => {
		renderPage("k1");
		// In read mode, knowledge-body (the blocks view) is visible
		expect(screen.getByTestId("knowledge-body")).toBeInTheDocument();
		// Editor is NOT present in read mode
		expect(screen.queryByTestId("mock-body-editor")).not.toBeInTheDocument();
	});

	it("edit-panel has data-testid knowledge-edit-panel when in edit mode", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));
		expect(screen.getByTestId("knowledge-edit-panel")).toBeInTheDocument();
	});
});
