/**
 * AA2 — RoutineCreateDialog component tests.
 *
 * AC-1: Dialog renders all fields (name, description, schedule, agent).
 *       Create button disabled when required fields empty.
 *       Create button enabled when required fields filled.
 *       Submit calls API with correct payload.
 *       Cancel closes dialog.
 *       Error state shows error message.
 *       Schedule picker shows presets.
 *       Custom schedule input appears when "Custom..." selected.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoutineCreateDialog } from "../pages/work/RoutineCreateDialog.js";
import * as apiFetchModule from "../services/api-fetch.js";

// Mock apiFetch for submit tests
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

const MOCK_TEAMS = [{ id: "team-1", name: "Build Team" }];
const MOCK_AGENTS = [
	{ id: "agent-1", name: "Digest Agent" },
	{ id: "agent-2", name: "Review Agent" },
];

function renderDialog(overrides: Partial<Parameters<typeof RoutineCreateDialog>[0]> = {}): void {
	const defaultProps = {
		open: true,
		onClose: vi.fn(),
		onCreated: vi.fn(),
		teams: MOCK_TEAMS,
		agents: MOCK_AGENTS,
		...overrides,
	};

	render(<RoutineCreateDialog {...defaultProps} />);
}

describe("RoutineCreateDialog", () => {
	const mockApiFetch = vi.mocked(apiFetchModule.apiFetch);

	beforeEach(() => {
		mockApiFetch.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders dialog with name field", () => {
		renderDialog();
		expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
	});

	it("renders description field", () => {
		renderDialog();
		// Description can be a textarea or labeled input
		expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument();
	});

	it("renders agent select with provided agents", () => {
		renderDialog();
		expect(screen.getByText("Digest Agent")).toBeInTheDocument();
		expect(screen.getByText("Review Agent")).toBeInTheDocument();
	});

	it("renders schedule picker with preset options", () => {
		renderDialog();
		// Schedule picker should have preset options
		expect(screen.getByText(/every hour/i)).toBeInTheDocument();
	});

	it("Create button is disabled when name is empty", () => {
		renderDialog();
		const createBtn = screen.getByRole("button", { name: /create/i });
		expect(createBtn).toBeDisabled();
	});

	it("Create button is enabled when required fields are filled", () => {
		renderDialog();

		const nameInput = screen.getByLabelText(/name/i);
		fireEvent.change(nameInput, { target: { value: "My routine" } });

		// Schedule is pre-selected to first preset, agent selected first
		const agentSelect = screen.getByLabelText(/agent/i);
		fireEvent.change(agentSelect, { target: { value: "agent-1" } });

		const createBtn = screen.getByRole("button", { name: /create/i });
		expect(createBtn).not.toBeDisabled();
	});

	it("calls onClose when Cancel is clicked", () => {
		const onClose = vi.fn();
		renderDialog({ onClose });

		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

		expect(onClose).toHaveBeenCalledOnce();
	});

	it("calls API with correct payload on submit", async () => {
		const onCreated = vi.fn();
		const onClose = vi.fn();

		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: vi.fn().mockResolvedValue({ id: "new-routine", name: "Test Routine" }),
		} as unknown as Response);

		renderDialog({ onCreated, onClose });

		const nameInput = screen.getByLabelText(/name/i);
		fireEvent.change(nameInput, { target: { value: "Test Routine" } });

		const agentSelect = screen.getByLabelText(/agent/i);
		fireEvent.change(agentSelect, { target: { value: "agent-1" } });

		fireEvent.click(screen.getByRole("button", { name: /create/i }));

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalledWith(
				"/api/routines",
				expect.objectContaining({ method: "POST" }),
			);
		});

		await waitFor(() => {
			expect(onCreated).toHaveBeenCalledOnce();
			expect(onClose).toHaveBeenCalledOnce();
		});
	});

	it("shows error message when API call fails", async () => {
		mockApiFetch.mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: vi.fn().mockResolvedValue({ error: "Invalid cron expression" }),
		} as unknown as Response);

		renderDialog();

		const nameInput = screen.getByLabelText(/name/i);
		fireEvent.change(nameInput, { target: { value: "Bad Routine" } });

		const agentSelect = screen.getByLabelText(/agent/i);
		fireEvent.change(agentSelect, { target: { value: "agent-1" } });

		fireEvent.click(screen.getByRole("button", { name: /create/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
			expect(screen.getByText(/invalid cron expression/i)).toBeInTheDocument();
		});
	});

	it("shows custom schedule input when Custom... option is selected", () => {
		renderDialog();

		const scheduleSelect = screen.getByLabelText(/schedule/i);
		fireEvent.change(scheduleSelect, { target: { value: "custom" } });

		expect(screen.getByPlaceholderText(/cron/i)).toBeInTheDocument();
	});

	it("hides custom schedule input when preset is selected", () => {
		renderDialog();

		const scheduleSelect = screen.getByLabelText(/schedule/i);
		// First select custom
		fireEvent.change(scheduleSelect, { target: { value: "custom" } });
		expect(screen.getByPlaceholderText(/cron/i)).toBeInTheDocument();

		// Then select a preset
		fireEvent.change(scheduleSelect, { target: { value: "0 * * * *" } });
		expect(screen.queryByPlaceholderText(/cron/i)).not.toBeInTheDocument();
	});

	it("does not render when open is false", () => {
		renderDialog({ open: false });
		// Dialog content should not be visible
		expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
	});
});
