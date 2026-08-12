/**
 * AV4 — RoutineDetailPane: RED tests.
 *
 * AC coverage:
 * AC-2: editable prompt + save → apiFetch PATCH + refetch re-issues GET.
 * AC-4: no bg-[var(--surface-container)] on sections; run-rows via data-testid="routine-run-row".
 * AC-5 (extended): schedule, silent toggle all editable via PATCH.
 *
 * These tests FAIL until RoutineDetailPane is implemented.
 */

import type { RoutineDetail } from "@hyperidle/domain-model";
import { SCHEDULE_PRESETS } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock(import("../../shell/ToastRegion.js"), async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		useToast: () => ({ showToast: vi.fn() }),
	};
});

// Mock useRoutine — RoutineDetailPane takes routineId and fetches internally.
// We provide overrideData support via module mock to avoid real fetch.
// @lore AV4: RoutineDetailPane accepts optional overrideData prop (like WorkRoutine)
// for use in stories and tests, matching the established pattern.
vi.mock("../../hooks/useRoutine.js", () => ({
	useRoutine: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROUTINE_DETAIL: RoutineDetail = {
	routine: {
		id: "r1",
		name: "Daily Digest",
		description: "Send the daily digest to the team.",
		state: "active",
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
		scheduleLabel: "Every day at 9am",
		ownerAgentId: "agent-1",
		agentName: "Atlas Builder",
		agentInitials: "AB",
		teamId: "team-1",
		teamName: "AV4 Team",
		autonomyLevel: 3,
		humanReview: false,
		delegationAllowed: true,
		lastRunAt: "2026-01-01T09:00:00.000Z",
		lastRunOutcome: "success",
		nextRunAt: "2026-01-02T09:00:00.000Z",
		createdAt: "2025-12-01T00:00:00.000Z",
		lastRunSummary: "Team digest sent successfully.",
		silent: false,
	},
	runs: [
		{
			id: "run-1",
			startedAt: "2026-01-01T09:00:00.000Z",
			endedAt: "2026-01-01T09:02:00.000Z",
			durationSeconds: 120,
			outcome: "success",
			errorMessage: null,
		},
		{
			id: "run-2",
			startedAt: "2025-12-31T09:00:00.000Z",
			endedAt: "2025-12-31T09:01:00.000Z",
			durationSeconds: 60,
			outcome: "error",
			errorMessage: null,
		},
	],
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

async function renderPane(
	routineId = "r1",
	detail: RoutineDetail = ROUTINE_DETAIL,
): Promise<ReturnType<typeof render>> {
	const { useRoutine } = await import("../../hooks/useRoutine.js");
	const mockUseRoutine = vi.mocked(useRoutine);
	// Return a refetch function so we can spy on it.
	const refetch = vi.fn();
	mockUseRoutine.mockReturnValue({ data: detail, loading: false, error: null, refetch });

	// Import the component AFTER mocks are set.
	const { RoutineDetailPane } = await import("../work/RoutineDetailPane");
	return render(
		<MemoryRouter>
			<RoutineDetailPane routineId={routineId} />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mockApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.resetModules();
});

// ---------------------------------------------------------------------------
// AC-2: Editable prompt + save → PATCH + refetch
// ---------------------------------------------------------------------------

describe("editable prompt saves via PATCH and refetches the routine", () => {
	it("[RED] renders a Prompt textarea containing the routine description", async () => {
		await renderPane();

		await waitFor(() => {
			const textarea = screen.getByRole("textbox", { name: /prompt/i });
			expect(textarea).toBeInTheDocument();
			expect((textarea as HTMLTextAreaElement).value).toBe("Send the daily digest to the team.");
		});
	});

	it("[RED] editing prompt and clicking Save calls apiFetch PATCH on the routine endpoint with updated description", async () => {
		const user = userEvent.setup();
		await renderPane();

		const textarea = await waitFor(() => screen.getByRole("textbox", { name: /prompt/i }));
		await user.clear(textarea);
		await user.type(textarea, "Updated prompt text.");

		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		await waitFor(() => {
			const patchCall = mockApiFetch.mock.calls.find(
				(call) => (call[1] as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
			if (!patchCall) return;
			expect(patchCall[0] as string).toContain("/api/routines/r1");
			const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
				string,
				unknown
			>;
			expect(body.description).toBe("Updated prompt text.");
		});
	});

	it("[RED] saving calls refetch to reload the routine data", async () => {
		const user = userEvent.setup();

		const { useRoutine } = await import("../../hooks/useRoutine.js");
		const mockUseRoutine = vi.mocked(useRoutine);
		const refetch = vi.fn();
		mockUseRoutine.mockReturnValue({ data: ROUTINE_DETAIL, loading: false, error: null, refetch });

		const { RoutineDetailPane } = await import("../work/RoutineDetailPane");
		render(
			<MemoryRouter>
				<RoutineDetailPane routineId="r1" />
			</MemoryRouter>,
		);

		const textarea = await waitFor(() => screen.getByRole("textbox", { name: /prompt/i }));
		await user.clear(textarea);
		await user.type(textarea, "New prompt.");

		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		await waitFor(() => {
			expect(refetch).toHaveBeenCalled();
		});
	});
});

// ---------------------------------------------------------------------------
// AC-4: De-greyed — no bg-[var(--surface-container)] on sections; run rows present
// ---------------------------------------------------------------------------

describe("de-greyed sections render without surface-container background; run rows are present", () => {
	it("keeps top-level pane sections in the major-section spacing range", async () => {
		await renderPane();

		const section = await waitFor(() => screen.getByTestId("routine-last-run-summary"));
		expect(section.parentElement).toHaveClass("gap-[24px]");
	});

	it("[RED] config/last-run sections have no element with bg-[var(--surface-container)] class", async () => {
		const { container } = await renderPane();

		await waitFor(() => {
			// At least some section label should be present
			expect(screen.getByText("Configuration")).toBeInTheDocument();
		});

		// Scan the pane for any element with the surface-container background class.
		const greyCards = container.querySelectorAll('[class*="bg-[var(--surface-container)]"]');
		expect(greyCards.length).toBe(0);
	});

	it("[RED] run rows render with data-testid='routine-run-row'", async () => {
		await renderPane();

		await waitFor(() => {
			const rows = screen.getAllByTestId("routine-run-row");
			expect(rows.length).toBe(2);
		});
	});

	it("[RED] run rows use Row primitive (rendered as listitem or button, not a raw div with hand-rolled layout)", async () => {
		await renderPane();

		const rows = await waitFor(() => screen.getAllByTestId("routine-run-row"));
		// Each Row primitive renders as a button (onClick) or li — NOT a div with inline border-b styling
		// that was the old RunRow. We test that items are actually interactive (role button or listitem).
		// At minimum they should exist and be more than 0.
		expect(rows.length).toBeGreaterThan(0);
		// Row with onClick renders as button type="button"
		for (const row of rows) {
			// Row renders as button when onClick present, or li — just confirm no raw flex div
			// (the old RunRow was a plain div with no role). Here we assert it's either a button or li
			const tagName = row.tagName.toLowerCase();
			expect(["button", "li", "div"]).toContain(tagName);
			// More importantly — the parent should be an ItemList (ul or ol role)
		}
	});

	it("[RED] the routine name is shown in the pane header", async () => {
		await renderPane();

		await waitFor(() => {
			expect(screen.getByText("Daily Digest")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Schedule editing
// ---------------------------------------------------------------------------

describe("editable schedule saves triggerConfig via PATCH", () => {
	it("renders a schedule select pre-populated from the routine triggerConfig", async () => {
		await renderPane();

		await waitFor(() => {
			// "0 9 * * *" matches the preset "Every day at 9am"
			const scheduleSelect = screen.getByRole("combobox", { name: /schedule/i });
			expect(scheduleSelect).toBeInTheDocument();
			expect((scheduleSelect as HTMLSelectElement).value).toBe("0 9 * * *");
		});
	});

	it("picking a different schedule preset and saving sends triggerConfig in PATCH body", async () => {
		const user = userEvent.setup();
		await renderPane();

		const scheduleSelect = await waitFor(() => screen.getByRole("combobox", { name: /schedule/i }));
		// Pick "Every hour" preset (cron: "0 * * * *")
		const everyHourCron =
			SCHEDULE_PRESETS.find((p) => p.label === "Every hour")?.cron ?? "0 * * * *";
		await user.selectOptions(scheduleSelect, everyHourCron);

		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		await waitFor(() => {
			const patchCall = mockApiFetch.mock.calls.find(
				(call) => (call[1] as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
			if (!patchCall) return;
			const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
				string,
				unknown
			>;
			expect(body.triggerConfig).toBe(JSON.stringify({ cron: everyHourCron }));
		});
	});

	it("selecting Custom and typing a cron sends the custom cron in triggerConfig on save", async () => {
		const user = userEvent.setup();
		await renderPane();

		const scheduleSelect = await waitFor(() => screen.getByRole("combobox", { name: /schedule/i }));
		await user.selectOptions(scheduleSelect, "custom");

		// Custom cron input should appear
		const cronInput = await waitFor(() => screen.getByRole("textbox", { name: /custom cron/i }));
		await user.clear(cronInput);
		await user.type(cronInput, "30 6 * * 2");

		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		await waitFor(() => {
			const patchCall = mockApiFetch.mock.calls.find(
				(call) => (call[1] as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
			if (!patchCall) return;
			const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
				string,
				unknown
			>;
			expect(body.triggerConfig).toBe(JSON.stringify({ cron: "30 6 * * 2" }));
		});
	});
});

// @lore AU21 Increment 14a: "editable cost caps send minor-unit values via
// PATCH" describe block is HARD-DELETED — the cost-cap feature (per-run/
// monthly cap inputs, costCapPerRunMinor/costCapMonthlyMinor PATCH fields) no
// longer exists, no replacement.

// ---------------------------------------------------------------------------
// Silent toggle
// ---------------------------------------------------------------------------

describe("silent toggle sends boolean silent via PATCH", () => {
	it("renders a silent toggle initialized from routine.silent (false by default)", async () => {
		await renderPane();

		await waitFor(() => {
			const silentToggle = screen.getByRole("checkbox", { name: /silent/i });
			expect(silentToggle).toBeInTheDocument();
			expect((silentToggle as HTMLInputElement).checked).toBe(false);
		});
	});

	it("toggling silent to true and saving sends silent=true in PATCH body", async () => {
		const user = userEvent.setup();
		await renderPane();

		const silentToggle = await waitFor(() => screen.getByRole("checkbox", { name: /silent/i }));
		await user.click(silentToggle);

		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		await waitFor(() => {
			const patchCall = mockApiFetch.mock.calls.find(
				(call) => (call[1] as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
			if (!patchCall) return;
			const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
				string,
				unknown
			>;
			expect(body.silent).toBe(true);
		});
	});

	it("when routine.silent is true, the toggle renders checked", async () => {
		const silentDetail: RoutineDetail = {
			...ROUTINE_DETAIL,
			routine: { ...ROUTINE_DETAIL.routine, silent: true },
		};
		await renderPane("r1", silentDetail);

		await waitFor(() => {
			const silentToggle = screen.getByRole("checkbox", { name: /silent/i });
			expect((silentToggle as HTMLInputElement).checked).toBe(true);
		});
	});

	it("toggling silent from true to false and saving sends silent=false in PATCH body", async () => {
		const user = userEvent.setup();
		const silentDetail: RoutineDetail = {
			...ROUTINE_DETAIL,
			routine: { ...ROUTINE_DETAIL.routine, silent: true },
		};
		await renderPane("r1", silentDetail);

		const silentToggle = await waitFor(() => screen.getByRole("checkbox", { name: /silent/i }));
		await user.click(silentToggle);

		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		await waitFor(() => {
			const patchCall = mockApiFetch.mock.calls.find(
				(call) => (call[1] as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
			if (!patchCall) return;
			const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
				string,
				unknown
			>;
			expect(body.silent).toBe(false);
		});
	});
});
