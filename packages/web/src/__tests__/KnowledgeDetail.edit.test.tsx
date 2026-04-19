import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";

function renderPage(knowledgeId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail — J7 edit mode (non-factory)", () => {
	it("shows the Edit button for a practice-scope item", () => {
		renderPage("k1");
		expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
	});

	it("enters edit mode when the Edit button is clicked", async () => {
		const user = userEvent.setup();
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));
		expect(screen.getByTestId("knowledge-edit-textarea")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
	});

	it("textarea shows the current markdown content", async () => {
		const user = userEvent.setup();
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));
		const textarea = screen.getByTestId("knowledge-edit-textarea") as HTMLTextAreaElement;
		expect(textarea.value).toMatch(/JWT-based authentication/);
	});

	it("renders a markdown preview alongside the textarea", async () => {
		const user = userEvent.setup();
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));
		expect(screen.getByTestId("knowledge-edit-preview")).toBeInTheDocument();
	});

	it("Cancel reverts unsaved changes without calling save", async () => {
		const user = userEvent.setup();
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));
		const textarea = screen.getByTestId("knowledge-edit-textarea") as HTMLTextAreaElement;
		const original = textarea.value;
		await user.clear(textarea);
		await user.type(textarea, "Throwaway edit");
		await user.click(screen.getByRole("button", { name: /cancel/i }));
		// Back in read mode; original content still visible in the body.
		const body = screen.getByTestId("knowledge-body");
		expect(body.textContent).toContain(original.slice(0, 20));
		// Re-opening edit mode should restore the original value, not the throwaway.
		await user.click(screen.getByRole("button", { name: /edit/i }));
		const textareaAgain = screen.getByTestId("knowledge-edit-textarea") as HTMLTextAreaElement;
		expect(textareaAgain.value).toBe(original);
	});

	it("Save persists the edit into the body and exits edit mode", async () => {
		const user = userEvent.setup();
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));
		const textarea = screen.getByTestId("knowledge-edit-textarea") as HTMLTextAreaElement;
		await user.clear(textarea);
		await user.type(textarea, "New body content for k1");
		await user.click(screen.getByRole("button", { name: /save/i }));
		// Out of edit mode: textarea gone, body visible with new content.
		expect(screen.queryByTestId("knowledge-edit-textarea")).not.toBeInTheDocument();
		expect(screen.getByTestId("knowledge-body").textContent).toContain("New body content for k1");
	});
});
