/**
 * AB3 — AgentSetupDialog unit tests (TDD red phase).
 *
 * Covers all acceptance criteria from plans/AB3/architecture.md.
 *
 * Mocks:
 *   - apiFetch: intercepts GET /api/workers, GET /api/model-gateway,
 *               GET /api/agents/templates/:role, POST /api/agents
 *   - WorkTeam rendered via overrideData to inject roster fixture data
 *
 * @lore AB3: The dialog is tested both directly (AgentSetupDialog component)
 * and indirectly (via WorkTeam overrideData) for AC-1 and AC-2 which test the
 * entry points. The component itself does not exist yet — these tests are the
 * red phase that define the interface.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../../WorkTeam";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// Mock apiFetch — the primary integration point for all API calls
vi.mock("../../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

/** TeamDetail with 2 agents already on the roster */
const MOCK_TEAM_WITH_AGENTS = {
	team: {
		id: "team-abc",
		name: "HyperIdle Core",
		phase: "build",
		status: "healthy",
		leadAgentId: "agent-1",
	},
	teamMembers: { id: "tm-uuid-123", formedAt: "2024-01-01T00:00:00.000Z", dissolvedAt: null },
	roster: [
		{ agentId: "agent-1", name: "Atlas", role: "product_manager", isLead: true },
		{ agentId: "agent-2", name: "Nova", role: "practice_facilitator", isLead: false },
	],
	burn: {
		costActual: { minor: 4200, currency: "USD" },
		costCap: { minor: 10000, currency: "USD" },
		capacity: 5,
		activeBets: 2,
	},
	activeBets: [],
};

/** TeamDetail with zero agents — triggers empty state CTA */
const MOCK_TEAM_NO_AGENTS = {
	...MOCK_TEAM_WITH_AGENTS,
	roster: [],
};

/** Mock workers response — two adapters, one paused */
const MOCK_WORKERS = [
	{ id: "worker-1", name: "Built-in Executor", kind: "builtin", type: "builtin", currentLoad: 0, maxConcurrent: 10, paused: false },
	{ id: "worker-2", name: "Claude Code Worker", kind: "claude-code", type: "claude-code", currentLoad: 0, maxConcurrent: 5, paused: true },
];

/** Mock workers where all are paused */
const MOCK_WORKERS_ALL_PAUSED = [
	{ id: "worker-1", name: "Built-in Executor", kind: "builtin", type: "builtin", currentLoad: 0, maxConcurrent: 10, paused: true },
];

/** Mock gateway config — all tiers configured */
const MOCK_GATEWAY_ALL_CONFIGURED = {
	reasoning: { provider: "anthropic", model: "claude-3-opus", hasApiKey: true },
	workhorse: { provider: "anthropic", model: "claude-3-sonnet", hasApiKey: true },
	fast: { provider: "anthropic", model: "claude-3-haiku", hasApiKey: true },
};

/** Mock gateway config — reasoning tier not configured */
const MOCK_GATEWAY_REASONING_UNCONFIGURED = {
	reasoning: { provider: "anthropic", model: "claude-3-opus", hasApiKey: false },
	workhorse: { provider: "anthropic", model: "claude-3-sonnet", hasApiKey: true },
	fast: { provider: "anthropic", model: "claude-3-haiku", hasApiKey: true },
};

/** Mock AgentConfig returned by POST /api/agents on success */
const MOCK_CREATED_AGENT = {
	id: "agent-new",
	name: "Orion",
	role: "product_manager",
	soulPrompt: "You are a product manager...",
	harnessType: "builtin",
	modelTierPreference: "workhorse",
	maxConcurrentSessions: 1,
	teamId: "tm-uuid-123",
};

/** Template content returned by GET /api/agents/templates/product_manager */
const MOCK_TEMPLATE_CONTENT = "You are a Product Manager agent. Your role is to shape bets, write pitches, and define done conditions.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up the apiFetch mock to return appropriate responses for each endpoint.
 * Called in beforeEach to provide a clean mock state.
 */
async function setupApiFetchMock(overrides: {
	workers?: typeof MOCK_WORKERS;
	gateway?: typeof MOCK_GATEWAY_ALL_CONFIGURED;
	templateContent?: string | null;
	createAgentStatus?: number;
} = {}): Promise<ReturnType<typeof vi.fn>> {
	const { apiFetch } = await import("../../../services/api-fetch.js");
	const fetchSpy = vi.mocked(apiFetch);

	const workers = overrides.workers ?? MOCK_WORKERS;
	const gateway = overrides.gateway ?? MOCK_GATEWAY_ALL_CONFIGURED;
	const templateContent = overrides.templateContent ?? MOCK_TEMPLATE_CONTENT;
	const createStatus = overrides.createAgentStatus ?? 201;

	fetchSpy.mockImplementation(async (url: string, options?: RequestInit) => {
		const urlStr = String(url);

		// GET /api/workers
		if (urlStr === "/api/workers" && (!options?.method || options.method === "GET")) {
			return {
				ok: true,
				status: 200,
				json: async () => workers,
			} as Response;
		}

		// GET /api/model-gateway
		if (urlStr === "/api/model-gateway" && (!options?.method || options.method === "GET")) {
			return {
				ok: true,
				status: 200,
				json: async () => gateway,
			} as Response;
		}

		// GET /api/agents/templates/:role
		if (urlStr.startsWith("/api/agents/templates/") && (!options?.method || options.method === "GET")) {
			if (templateContent === null) {
				return {
					ok: false,
					status: 404,
					json: async () => ({ error: "Not found", code: "NOT_FOUND" }),
				} as Response;
			}
			const role = urlStr.replace("/api/agents/templates/", "");
			return {
				ok: true,
				status: 200,
				json: async () => ({ role, content: templateContent }),
			} as Response;
		}

		// POST /api/agents
		if (urlStr === "/api/agents" && options?.method === "POST") {
			if (createStatus === 201) {
				return {
					ok: true,
					status: 201,
					json: async () => MOCK_CREATED_AGENT,
				} as Response;
			}
			return {
				ok: false,
				status: 500,
				json: async () => ({ error: "Internal server error" }),
			} as Response;
		}

		// Fallback — pass through unknown URLs (e.g. artifact section)
		return {
			ok: true,
			status: 200,
			json: async () => ({ items: [], nextCursor: null }),
		} as Response;
	});

	return fetchSpy;
}

/** Render the WorkTeam page wrapped in MemoryRouter with fixture data injected */
function renderWorkTeam(
	overrideData: typeof MOCK_TEAM_WITH_AGENTS | typeof MOCK_TEAM_NO_AGENTS = MOCK_TEAM_WITH_AGENTS,
): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/product/team-abc"]}>
			<Routes>
				<Route
					path="/work/product/:productId"
					element={
						<WorkTeam
							overrideData={overrideData}
							overrideLoading={false}
							overrideError={null}
							skipArtifacts={true}
						/>
					}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

/** Navigate the wizard to a specific step by interacting through previous steps */
async function navigateToStep2(user: ReturnType<typeof userEvent.setup>): Promise<void> {
	// Click Product Manager card (first preset)
	const pmCard = screen.getByRole("radio", { name: /product manager/i });
	await user.click(pmCard);

	// Click Next
	const nextBtn = screen.getByRole("button", { name: /next/i });
	await user.click(nextBtn);
}

async function navigateToStep3(user: ReturnType<typeof userEvent.setup>, agentName = "Orion"): Promise<void> {
	await navigateToStep2(user);

	// Fill in agent name
	const nameInput = screen.getByLabelText(/agent name/i);
	await user.type(nameInput, agentName);

	// Click Next
	const nextBtn = screen.getByRole("button", { name: /next/i });
	await user.click(nextBtn);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentSetupDialog", () => {
	beforeEach(async () => {
		await setupApiFetchMock();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// -------------------------------------------------------------------------
	// AC-1: Wizard dialog opens from team page (non-empty roster)
	// -------------------------------------------------------------------------
	describe("AC-1: opens from WorkTeam + Add agent button", () => {
		it("renders a '+ Add agent' button when the roster has agents", () => {
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);
			expect(screen.getByRole("button", { name: /\+ add agent/i })).toBeInTheDocument();
		});

		it("clicking '+ Add agent' opens the wizard dialog", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				const dialog = screen.getByRole("dialog", { name: /create new agent/i });
				expect(dialog).toBeInTheDocument();
			});
		});
	});

	// -------------------------------------------------------------------------
	// AC-2 / AC-11: Empty state CTA opens wizard (first-time users)
	// -------------------------------------------------------------------------
	describe("AC-2: empty state CTA opens wizard", () => {
		it("shows 'No agents on this team' EmptyState when roster is empty", () => {
			renderWorkTeam(MOCK_TEAM_NO_AGENTS);
			expect(screen.getByText("No agents on this team")).toBeInTheDocument();
		});

		it("shows 'Add first agent' button in the empty state", () => {
			renderWorkTeam(MOCK_TEAM_NO_AGENTS);
			expect(screen.getByRole("button", { name: /add first agent/i })).toBeInTheDocument();
		});

		it("clicking 'Add first agent' opens the wizard dialog", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_NO_AGENTS);

			const addFirstBtn = screen.getByRole("button", { name: /add first agent/i });
			await user.click(addFirstBtn);

			await waitFor(() => {
				const dialog = screen.getByRole("dialog", { name: /create new agent/i });
				expect(dialog).toBeInTheDocument();
			});
		});
	});

	// -------------------------------------------------------------------------
	// AC-3: Step 1 shows role cards with descriptions
	// -------------------------------------------------------------------------
	describe("AC-3: Step 1 shows role cards, Next disabled until selection", () => {
		it("renders 4 role cards (3 presets + Custom)", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				const cards = screen.getAllByRole("radio");
				expect(cards).toHaveLength(4);
			});
		});

		it("renders Product Manager, Practice Facilitator, Chief of Staff, and Custom cards", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
				expect(screen.getByRole("radio", { name: /practice facilitator/i })).toBeInTheDocument();
				expect(screen.getByRole("radio", { name: /chief of staff/i })).toBeInTheDocument();
				expect(screen.getByRole("radio", { name: /custom/i })).toBeInTheDocument();
			});
		});

		it("'Next' button is disabled when no role is selected", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				const nextBtn = screen.getByRole("button", { name: /next/i });
				expect(nextBtn).toBeDisabled();
			});
		});

		it("clicking a role card selects it and enables 'Next'", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			const pmCard = screen.getByRole("radio", { name: /product manager/i });
			await user.click(pmCard);

			expect(pmCard).toHaveAttribute("aria-checked", "true");
			const nextBtn = screen.getByRole("button", { name: /next/i });
			expect(nextBtn).not.toBeDisabled();
		});
	});

	// -------------------------------------------------------------------------
	// AC-4: Role selection pre-fills soul prompt template
	// -------------------------------------------------------------------------
	describe("AC-4: role selection pre-fills soul prompt template", () => {
		it("navigating to Step 2 after selecting Product Manager pre-fills the soul prompt", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			const pmCard = screen.getByRole("radio", { name: /product manager/i });
			await user.click(pmCard);

			const nextBtn = screen.getByRole("button", { name: /next/i });
			await user.click(nextBtn);

			// Soul prompt textarea should be pre-filled with the template
			await waitFor(() => {
				const textarea = screen.getByLabelText(/soul prompt/i);
				expect(textarea).toHaveValue(MOCK_TEMPLATE_CONTENT);
			});
		});

		it("selecting Custom role leaves soul prompt textarea empty", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /custom/i })).toBeInTheDocument();
			});

			const customCard = screen.getByRole("radio", { name: /custom/i });
			await user.click(customCard);

			const nextBtn = screen.getByRole("button", { name: /next/i });
			await user.click(nextBtn);

			// Soul prompt textarea should be empty for custom
			const textarea = screen.getByLabelText(/soul prompt/i);
			expect(textarea).toHaveValue("");
		});
	});

	// -------------------------------------------------------------------------
	// AC-5: Step 2 validates agent name
	// -------------------------------------------------------------------------
	describe("AC-5: validates agent name non-empty and unique", () => {
		it("'Next' is disabled when agent name is empty", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep2(user);

			// Name field is empty — Next should be disabled
			const nextBtn = screen.getByRole("button", { name: /next/i });
			expect(nextBtn).toBeDisabled();
		});

		it("'Next' is enabled once a valid unique name is typed", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep2(user);

			const nameInput = screen.getByLabelText(/agent name/i);
			await user.type(nameInput, "Orion");

			const nextBtn = screen.getByRole("button", { name: /next/i });
			expect(nextBtn).not.toBeDisabled();
		});

		it("shows 'already exists' error when name matches an existing team agent", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep2(user);

			// "Atlas" is already in the roster (MOCK_TEAM_WITH_AGENTS.roster[0].name)
			const nameInput = screen.getByLabelText(/agent name/i);
			await user.type(nameInput, "Atlas");

			await waitFor(() => {
				expect(screen.getByText(/already exists/i)).toBeInTheDocument();
			});

			const nextBtn = screen.getByRole("button", { name: /next/i });
			expect(nextBtn).toBeDisabled();
		});
	});

	// -------------------------------------------------------------------------
	// AC-6: Step 3 shows harness select populated from workers
	// -------------------------------------------------------------------------
	describe("AC-6: Step 3 harness select from workers, excludes paused", () => {
		it("only shows non-paused adapters in the harness select", async () => {
			const user = userEvent.setup();
			// MOCK_WORKERS has one non-paused and one paused adapter
			await setupApiFetchMock({ workers: MOCK_WORKERS });
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep3(user);

			await waitFor(() => {
				// Only "Built-in Executor" (paused: false) should be in the select
				expect(screen.getByRole("option", { name: /built-in executor/i })).toBeInTheDocument();
				expect(screen.queryByRole("option", { name: /claude code worker/i })).not.toBeInTheDocument();
			});
		});

		it("shows amber warning and disables Create when no adapters are available", async () => {
			const user = userEvent.setup();
			await setupApiFetchMock({ workers: MOCK_WORKERS_ALL_PAUSED });
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep3(user);

			await waitFor(() => {
				expect(screen.getByText(/no harness adapters available/i)).toBeInTheDocument();
			});

			const createBtn = screen.getByRole("button", { name: /create agent/i });
			expect(createBtn).toBeDisabled();
		});
	});

	// -------------------------------------------------------------------------
	// AC-7: Step 3 shows model tier select with validation
	// -------------------------------------------------------------------------
	describe("AC-7: model tier default workhorse, amber warning on unconfigured tier", () => {
		it("defaults to 'workhorse' model tier", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep3(user);

			await waitFor(() => {
				const tierSelect = screen.getByLabelText(/model tier/i);
				expect(tierSelect).toHaveValue("workhorse");
			});
		});

		it("shows amber warning when the selected tier has no configured provider", async () => {
			const user = userEvent.setup();
			await setupApiFetchMock({ gateway: MOCK_GATEWAY_REASONING_UNCONFIGURED });
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep3(user);

			await waitFor(() => {
				const tierSelect = screen.getByLabelText(/model tier/i);
				expect(tierSelect).toBeInTheDocument();
			});

			// Change to reasoning (which is unconfigured)
			const tierSelect = screen.getByLabelText(/model tier/i);
			await userEvent.selectOptions(tierSelect, "reasoning");

			await waitFor(() => {
				// Should show warning about unconfigured provider
				expect(screen.getByText(/no provider configured/i)).toBeInTheDocument();
			});
		});
	});

	// -------------------------------------------------------------------------
	// AC-8: Validation before creation
	// -------------------------------------------------------------------------
	describe("AC-8: Create button disabled when validation fails", () => {
		it("'Create agent' is enabled with valid name, harness available, and no warnings", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep3(user, "Orion");

			await waitFor(() => {
				const createBtn = screen.getByRole("button", { name: /create agent/i });
				expect(createBtn).not.toBeDisabled();
			});
		});
	});

	// -------------------------------------------------------------------------
	// AC-9: Successful creation calls POST /api/agents
	// -------------------------------------------------------------------------
	describe("AC-9: successful creation calls POST /api/agents with correct body", () => {
		it("calls POST /api/agents with expected payload on Create agent click", async () => {
			const user = userEvent.setup();
			const fetchSpy = await setupApiFetchMock();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep3(user, "Orion");

			await waitFor(() => {
				const createBtn = screen.getByRole("button", { name: /create agent/i });
				expect(createBtn).not.toBeDisabled();
			});

			const createBtn = screen.getByRole("button", { name: /create agent/i });
			await user.click(createBtn);

			await waitFor(() => {
				// Find the POST /api/agents call
				const postCall = fetchSpy.mock.calls.find(
					([url, opts]) => String(url) === "/api/agents" && (opts as RequestInit)?.method === "POST",
				);
				expect(postCall).toBeDefined();

				if (postCall) {
					const [, opts] = postCall;
					const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
					expect(body).toMatchObject({
						name: "Orion",
						role: "product_manager",
						maxConcurrentSessions: 1,
						teamId: "tm-uuid-123",
					});
				}
			});
		});

		it("shows success state with 'Agent created' after 201 response", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep3(user, "Orion");

			await waitFor(() => {
				const createBtn = screen.getByRole("button", { name: /create agent/i });
				expect(createBtn).not.toBeDisabled();
			});

			const createBtn = screen.getByRole("button", { name: /create agent/i });
			await user.click(createBtn);

			await waitFor(() => {
				expect(screen.getByText(/agent created/i)).toBeInTheDocument();
			});
		});
	});

	// -------------------------------------------------------------------------
	// AC-10: Success state shows next steps
	// -------------------------------------------------------------------------
	describe("AC-10: success state shows next steps, Done closes dialog", () => {
		async function reachSuccessState(user: ReturnType<typeof userEvent.setup>): Promise<void> {
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /product manager/i })).toBeInTheDocument();
			});

			await navigateToStep3(user, "Orion");

			await waitFor(() => {
				const createBtn = screen.getByRole("button", { name: /create agent/i });
				expect(createBtn).not.toBeDisabled();
			});

			const createBtn = screen.getByRole("button", { name: /create agent/i });
			await user.click(createBtn);

			await waitFor(() => {
				expect(screen.getByText(/agent created/i)).toBeInTheDocument();
			});
		}

		it("shows 'Assign to a bet' and 'View in settings' after creation", async () => {
			const user = userEvent.setup();
			await reachSuccessState(user);

			expect(screen.getByRole("button", { name: /assign to a bet/i })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /view in settings/i })).toBeInTheDocument();
		});

		it("'Done' button is present in success state", async () => {
			const user = userEvent.setup();
			await reachSuccessState(user);

			expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument();
		});

		it("clicking 'Done' closes the dialog", async () => {
			const user = userEvent.setup();
			await reachSuccessState(user);

			const doneBtn = screen.getByRole("button", { name: /done/i });
			await user.click(doneBtn);

			await waitFor(() => {
				expect(screen.queryByRole("dialog", { name: /create new agent/i })).not.toBeInTheDocument();
			});
		});
	});

	// -------------------------------------------------------------------------
	// Additional: Escape closes dialog
	// -------------------------------------------------------------------------
	describe("Escape closes dialog", () => {
		it("pressing Escape closes the wizard dialog", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("dialog", { name: /create new agent/i })).toBeInTheDocument();
			});

			await user.keyboard("{Escape}");

			await waitFor(() => {
				expect(screen.queryByRole("dialog", { name: /create new agent/i })).not.toBeInTheDocument();
			});
		});
	});

	// -------------------------------------------------------------------------
	// Additional: Cancel closes dialog
	// -------------------------------------------------------------------------
	describe("Cancel closes dialog", () => {
		it("clicking Cancel closes the wizard dialog", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("dialog", { name: /create new agent/i })).toBeInTheDocument();
			});

			const cancelBtn = screen.getByRole("button", { name: /cancel/i });
			await user.click(cancelBtn);

			await waitFor(() => {
				expect(screen.queryByRole("dialog", { name: /create new agent/i })).not.toBeInTheDocument();
			});
		});
	});

	// -------------------------------------------------------------------------
	// Custom role sub-select (architecture critique note)
	// -------------------------------------------------------------------------
	describe("Custom role sub-select: maps to a real UserRole before API call", () => {
		it("shows a role sub-select when Custom card is selected", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /custom/i })).toBeInTheDocument();
			});

			const customCard = screen.getByRole("radio", { name: /custom/i });
			await user.click(customCard);

			// A role sub-select should appear for custom role mapping
			await waitFor(() => {
				expect(screen.getByLabelText(/role type/i)).toBeInTheDocument();
			});
		});

		it("includes builder, growth, and brand_voice options in the custom role sub-select", async () => {
			const user = userEvent.setup();
			renderWorkTeam(MOCK_TEAM_WITH_AGENTS);

			const addBtn = screen.getByRole("button", { name: /\+ add agent/i });
			await user.click(addBtn);

			await waitFor(() => {
				expect(screen.getByRole("radio", { name: /custom/i })).toBeInTheDocument();
			});

			const customCard = screen.getByRole("radio", { name: /custom/i });
			await user.click(customCard);

			await waitFor(() => {
				const select = screen.getByLabelText(/role type/i);
				const options = within(select).getAllByRole("option");
				const optionValues = options.map((o) => o.getAttribute("value"));
				expect(optionValues).toContain("builder");
				expect(optionValues).toContain("growth");
				expect(optionValues).toContain("brand_voice");
			});
		});
	});
});
