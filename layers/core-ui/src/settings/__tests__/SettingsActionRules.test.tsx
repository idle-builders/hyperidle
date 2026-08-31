/**
 * SettingsActionRules — DOM proof for the action rules settings section.
 *
 * Proves: empty state renders correctly when API returns [], populated list
 * renders one row per rule with pattern and scope visible, add-form elements
 * are present, scope-id input appears only for non-global scopes, auth error
 * shows the ErrorState.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsActionRules } from "../SettingsActionRules.js";

vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

const GLOBAL_RULE = {
	id: "rule-global-1",
	pattern: "git push",
	description: "Gate all pushes.",
	scope: "global",
	scopeId: null,
	createdAt: "2026-01-01T00:00:00.000Z",
};

const TEAM_RULE = {
	id: "rule-team-1",
	pattern: "deploy",
	description: "Gate deploys for infra team.",
	scope: "team",
	scopeId: "team-infra",
	createdAt: "2026-01-02T00:00:00.000Z",
};

function setupFetch(rules: unknown[]): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ rules }),
		}),
	);
}

function setupFetchError(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({}),
		}),
	);
}

describe("SettingsActionRules", () => {
	afterEach(() => vi.restoreAllMocks());

	describe("empty state", () => {
		beforeEach(() => setupFetch([]));

		it("shows the empty state message when no rules are defined", async () => {
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("action-rules-empty")).toBeInTheDocument();
			});
			expect(screen.getByTestId("action-rules-empty").textContent).toMatch(/No rules defined/i);
		});

		it("does not render the rules list when empty", async () => {
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("action-rules-empty")).toBeInTheDocument();
			});
			expect(screen.queryByTestId("action-rules-list")).not.toBeInTheDocument();
		});
	});

	describe("populated list", () => {
		beforeEach(() => setupFetch([GLOBAL_RULE, TEAM_RULE]));

		it("renders the rules list with one row per rule", async () => {
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("action-rules-list")).toBeInTheDocument();
			});
			// Both patterns visible
			const patterns = screen.getAllByTestId("rule-pattern");
			expect(patterns).toHaveLength(2);
			expect(patterns[0]?.textContent).toBe("git push");
			expect(patterns[1]?.textContent).toBe("deploy");
		});

		it("shows the scope label for each rule", async () => {
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("action-rules-list")).toBeInTheDocument();
			});
			// "Global" appears in both the rule Tag and the scope select — check list content
			const list = screen.getByTestId("action-rules-list");
			expect(list.textContent).toContain("Global");
			expect(screen.getByText("Team: team-infra")).toBeInTheDocument();
		});

		it("shows a Remove button per rule", async () => {
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("action-rules-list")).toBeInTheDocument();
			});
			const removeBtns = screen.getAllByText("Remove");
			expect(removeBtns).toHaveLength(2);
		});
	});

	describe("add-rule form", () => {
		beforeEach(() => setupFetch([]));

		it("renders pattern input, scope select, description input, and add button", async () => {
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("action-rules-empty")).toBeInTheDocument();
			});
			expect(screen.getByTestId("rule-input-pattern")).toBeInTheDocument();
			expect(screen.getByTestId("rule-select-scope")).toBeInTheDocument();
			expect(screen.getByTestId("rule-input-description")).toBeInTheDocument();
			expect(screen.getByTestId("rule-add-button")).toBeInTheDocument();
		});

		it("does not show scope-id input when scope is global", async () => {
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("rule-select-scope")).toBeInTheDocument();
			});
			expect(screen.queryByTestId("rule-input-scope-id")).not.toBeInTheDocument();
		});

		it("shows scope-id input when scope is changed to team", async () => {
			const user = userEvent.setup();
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("rule-select-scope")).toBeInTheDocument();
			});
			await user.selectOptions(screen.getByTestId("rule-select-scope"), "team");
			expect(screen.getByTestId("rule-input-scope-id")).toBeInTheDocument();
		});

		it("shows scope-id input when scope is changed to agent", async () => {
			const user = userEvent.setup();
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("rule-select-scope")).toBeInTheDocument();
			});
			await user.selectOptions(screen.getByTestId("rule-select-scope"), "agent");
			expect(screen.getByTestId("rule-input-scope-id")).toBeInTheDocument();
		});

		it("add button is disabled when pattern is empty", async () => {
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByTestId("rule-add-button")).toBeInTheDocument();
			});
			expect(screen.getByTestId("rule-add-button")).toBeDisabled();
		});
	});

	describe("error state", () => {
		beforeEach(() => setupFetchError());

		it("shows the error state when the API fails", async () => {
			render(<SettingsActionRules />);
			await waitFor(() => {
				expect(screen.getByText(/Couldn't load action rules/i)).toBeInTheDocument();
			});
		});
	});
});
