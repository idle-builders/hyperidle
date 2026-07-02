/**
 * AD8b — SettingsAssistant component tests (RED phase).
 *
 * AC-2: The assistant's system prompt is editable by the user in settings.
 *   - SettingsAssistant renders a textarea with system prompt
 *   - Save button is disabled when clean (no changes)
 *   - Save button is enabled when textarea content has changed (dirty state)
 *   - Save button shows "Saving..." while saving
 *   - Shows "Saved" briefly after successful save
 *   - Shows error message when save fails
 *   - Loading state: textarea is disabled with placeholder "Loading system prompt..."
 *
 * These tests FAIL until SettingsAssistant.tsx is created.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAssistant } from "../SettingsAssistant.js";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const MOCK_SOUL_PROMPT = "You are a helpful assistant focused on product development.";

function mockFetchSuccess(systemPrompt = MOCK_SOUL_PROMPT): void {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
		const method = (opts?.method ?? "GET").toUpperCase();
		const urlStr = typeof url === "string" ? url : url.toString();

		if (urlStr.includes("/assistant") && method === "GET") {
			return new Response(
				JSON.stringify({
					id: "ast-agent-1",
					name: "Assistant",
					systemPrompt,
					harnessType: "builtin",
					modelId: null,
					modelProvider: "openrouter",
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
		if (urlStr.includes("/assistant") && method === "PATCH") {
			const body = JSON.parse(opts?.body as string);
			return new Response(
				JSON.stringify({
					id: "ast-agent-1",
					name: "Assistant",
					systemPrompt: body.systemPrompt,
					harnessType: body.harnessType ?? null,
					modelId: body.modelId ?? null,
					modelProvider: body.modelProvider ?? null,
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		// AR4c: mock GET /api/harnesses for the harness options
		if (urlStr.includes("/harnesses") && method === "GET") {
			return new Response(
				JSON.stringify([
					{ type: "builtin", name: "Built-in Harness", modelProviders: ["openrouter"] },
				]),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		return new Response(null, { status: 404 });
	});
}

function mockFetchError(): void {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
		const method = (opts?.method ?? "GET").toUpperCase();
		const urlStr = typeof url === "string" ? url : url.toString();
		if (urlStr.includes("/assistant") && method === "GET") {
			return new Response(
				JSON.stringify({
					id: "ast-agent-1",
					name: "Assistant",
					systemPrompt: MOCK_SOUL_PROMPT,
					harnessType: null,
					modelId: null,
					modelProvider: null,
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		if (urlStr.includes("/assistant") && method === "PATCH") {
			return new Response(JSON.stringify({ error: "Internal error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
		// AR4c: mock harnesses — return empty list for error test
		if (urlStr.includes("/harnesses") && method === "GET") {
			return new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response(null, { status: 404 });
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AD8b — SettingsAssistant component", () => {
	beforeEach(() => {
		// Mock a logged-in user context
		vi.spyOn(Storage.prototype, "getItem").mockReturnValue("u-founder");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders a textarea for the system prompt", async () => {
		mockFetchSuccess();
		render(<SettingsAssistant userId="u-founder" />);

		// Wait for loading to complete
		await waitFor(() => {
			expect(screen.queryByPlaceholderText(/loading system prompt/i)).not.toBeInTheDocument();
		});

		const textarea = screen.getByRole("textbox");
		expect(textarea).toBeInTheDocument();
	});

	it("shows system prompt text after loading", async () => {
		mockFetchSuccess(MOCK_SOUL_PROMPT);
		render(<SettingsAssistant userId="u-founder" />);

		await waitFor(() => {
			const textarea = screen.getByRole("textbox");
			expect(textarea).toHaveValue(MOCK_SOUL_PROMPT);
		});
	});

	it("save button is disabled when content is clean (unchanged)", async () => {
		mockFetchSuccess();
		render(<SettingsAssistant userId="u-founder" />);

		await waitFor(() => {
			const saveButton = screen.getByRole("button", { name: /save/i });
			expect(saveButton).toBeDisabled();
		});
	});

	it("save button is enabled when content is dirty (changed)", async () => {
		const user = userEvent.setup();
		mockFetchSuccess();
		render(<SettingsAssistant userId="u-founder" />);

		// Wait for load
		await waitFor(() => {
			expect(screen.queryByPlaceholderText(/loading system prompt/i)).not.toBeInTheDocument();
		});

		const textarea = screen.getByRole("textbox");
		await user.clear(textarea);
		await user.type(textarea, "New custom prompt content");

		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).not.toBeDisabled();
	});

	it("shows 'Saving...' text on save button while saving", async () => {
		const user = userEvent.setup();

		// Slow response to catch the saving state
		vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
			const method = (opts?.method ?? "GET").toUpperCase();
			const urlStr = typeof url === "string" ? url : url.toString();

			if (urlStr.includes("/assistant") && method === "GET") {
				return new Response(
					JSON.stringify({ id: "ast-agent-1", name: "Assistant", systemPrompt: "Initial" }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			if (urlStr.includes("/assistant") && method === "PATCH") {
				// Delay to observe saving state
				await new Promise((r) => setTimeout(r, 100));
				const body = JSON.parse(opts?.body as string);
				return new Response(
					JSON.stringify({ id: "ast-agent-1", name: "Assistant", systemPrompt: body.systemPrompt }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response(null, { status: 404 });
		});

		render(<SettingsAssistant userId="u-founder" />);

		await waitFor(() => {
			expect(screen.queryByPlaceholderText(/loading system prompt/i)).not.toBeInTheDocument();
		});

		const textarea = screen.getByRole("textbox");
		await user.clear(textarea);
		await user.type(textarea, "Updated prompt");

		const saveButton = screen.getByRole("button", { name: /save/i });
		await user.click(saveButton);

		// "Saving..." should appear while request is in flight
		expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
	});

	it("shows helper text about assistant configuration", async () => {
		mockFetchSuccess();
		render(<SettingsAssistant userId="u-founder" />);

		// AR4c: description changed to the harness-config framing
		await waitFor(() => {
			expect(screen.getByText(/configure your personal assistant/i)).toBeInTheDocument();
		});
	});

	// AG7 AC: SettingsAssistant renders no internal <h2> (heading-conformance)
	it("does not render an internal h2 heading (SectionTitle is the only heading)", async () => {
		mockFetchSuccess();
		render(<SettingsAssistant userId="u-founder" />);

		// No h2 element should exist inside SettingsAssistant
		// (the SectionTitle is rendered by SettingsPage, outside this component)
		const headings = document.querySelectorAll("h2");
		expect(headings.length).toBe(0);
	});

	it("shows error message when save fails", async () => {
		const user = userEvent.setup();
		mockFetchError();
		render(<SettingsAssistant userId="u-founder" />);

		await waitFor(() => {
			expect(screen.queryByPlaceholderText(/loading system prompt/i)).not.toBeInTheDocument();
		});

		const textarea = screen.getByRole("textbox");
		await user.clear(textarea);
		await user.type(textarea, "Updated prompt");

		const saveButton = screen.getByRole("button", { name: /save/i });
		await user.click(saveButton);

		await waitFor(() => {
			// An error message should appear
			expect(screen.getByText(/error|failed|could not/i)).toBeInTheDocument();
		});
	});
});
