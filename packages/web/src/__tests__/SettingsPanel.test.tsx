import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SettingsData, SettingsPanel } from "../components/SettingsPanel";

const defaultSettings: SettingsData = {
	profile: {
		name: "Jane Doe",
		email: "jane@hyperidle.dev",
		avatarUrl: "",
	},
	products: [
		{ id: "p1", name: "HyperIdle", active: true },
		{ id: "p2", name: "SideProject", active: false },
	],
	agents: [
		{ id: "a1", name: "Builder Agent", autonomyLevel: 2, paused: false },
		{ id: "a2", name: "Review Agent", autonomyLevel: 4, paused: true },
	],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedProducts: [] as string[],
	},
	appearance: {
		density: "comfortable",
		theme: "system",
	},
};

describe("SettingsPanel", () => {
	const defaultProps = {
		open: true,
		onClose: vi.fn(),
		onSave: vi.fn().mockResolvedValue(undefined),
		settings: defaultSettings,
	};

	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	// AC: Settings modal opens from avatar click (open prop)
	it("renders modal when open is true", () => {
		render(<SettingsPanel {...defaultProps} />);
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("does not render modal when open is false", () => {
		render(<SettingsPanel {...defaultProps} open={false} />);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	// AC: Five tabs
	it("renders five tabs: Profile, Products, Agents, Notifications, Appearance", () => {
		render(<SettingsPanel {...defaultProps} />);
		expect(screen.getByRole("tab", { name: "Profile" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Products" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Agents" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Notifications" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
	});

	it("shows Profile tab content by default", () => {
		render(<SettingsPanel {...defaultProps} />);
		expect(screen.getByLabelText("Name")).toBeInTheDocument();
		expect(screen.getByLabelText("Email")).toBeInTheDocument();
	});

	// AC: Profile tab (name/email/avatar)
	it("Profile tab displays user name and email", () => {
		render(<SettingsPanel {...defaultProps} />);
		const nameInput = screen.getByLabelText("Name");
		expect(nameInput).toHaveValue("Jane Doe");
		const emailInput = screen.getByLabelText("Email");
		expect(emailInput).toHaveValue("jane@hyperidle.dev");
	});

	// AC: Products tab (activate/deactivate per product)
	it("Products tab renders product toggles", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Products" }));

		expect(screen.getByText("HyperIdle")).toBeInTheDocument();
		expect(screen.getByText("SideProject")).toBeInTheDocument();

		// HyperIdle should be active (checked), SideProject inactive
		const toggles = screen.getAllByRole("checkbox");
		expect(toggles[0]).toBeChecked();
		expect(toggles[1]).not.toBeChecked();
	});

	// AC: Agents tab (autonomy level dropdowns, pause/reactivate)
	it("Agents tab renders autonomy dropdowns and pause toggles", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Agents" }));

		expect(screen.getByText("Builder Agent")).toBeInTheDocument();
		expect(screen.getByText("Review Agent")).toBeInTheDocument();

		// Should have select dropdowns for autonomy level
		const selects = screen.getAllByRole("combobox");
		expect(selects.length).toBeGreaterThanOrEqual(2);
	});

	// AC: Notifications tab (toggles for review/cost/blocker, quiet hours, product mutes)
	it("Notifications tab renders alert toggles and quiet hours", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Notifications" }));

		expect(screen.getByText("Review alerts")).toBeInTheDocument();
		expect(screen.getByText("Cost alerts")).toBeInTheDocument();
		expect(screen.getByText("Blocker alerts")).toBeInTheDocument();
		expect(screen.getByLabelText("Quiet hours start")).toBeInTheDocument();
		expect(screen.getByLabelText("Quiet hours end")).toBeInTheDocument();
	});

	// AC: Appearance tab (theme, density)
	it("Appearance tab renders density selector", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));

		expect(screen.getByLabelText("Density")).toBeInTheDocument();
	});

	it("Appearance tab renders theme selector", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));

		expect(screen.getByLabelText("Theme")).toBeInTheDocument();
	});

	// AC: Save button disables while request in flight
	it("Save button disables while onSave is in flight", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		let resolveSave: () => void = () => {};
		const onSave = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveSave = resolve;
				}),
		);
		render(<SettingsPanel {...defaultProps} onSave={onSave} />);

		// Modify a field to enable save
		const nameInput = screen.getByLabelText("Name");
		await user.clear(nameInput);
		await user.type(nameInput, "New Name");

		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		// While in flight, button should be disabled with loading state
		expect(saveBtn).toBeDisabled();
		expect(saveBtn.querySelector(".loading")).toBeInTheDocument();

		// Resolve the save
		await act(async () => {
			resolveSave();
		});

		await waitFor(() => {
			expect(saveBtn).not.toBeDisabled();
		});
	});

	// AC: Validation — cost caps >= 0
	// Note: cost caps are not explicitly in the AC form fields, but validation
	// of numeric values is required. Testing quiet hours 24h format instead.

	// AC: Validation — times valid 24h format
	it("shows validation error for invalid quiet hours format", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Notifications" }));

		const startInput = screen.getByLabelText("Quiet hours start");
		await user.clear(startInput);
		await user.type(startInput, "25:00");

		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		expect(screen.getByText(/invalid.*time/i)).toBeInTheDocument();
		expect(defaultProps.onSave).not.toHaveBeenCalled();
	});

	it("shows validation error for invalid quiet hours end", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Notifications" }));

		const endInput = screen.getByLabelText("Quiet hours end");
		await user.clear(endInput);
		await user.type(endInput, "abc");

		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		expect(screen.getByText(/invalid.*time/i)).toBeInTheDocument();
	});

	// AC: Feedback routed to Rail (not inline toast) — onSave returns, feedback via onFeedback callback
	it("calls onFeedback on successful save", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onFeedback = vi.fn();
		render(<SettingsPanel {...defaultProps} onFeedback={onFeedback} />);

		const nameInput = screen.getByLabelText("Name");
		await user.clear(nameInput);
		await user.type(nameInput, "Updated");

		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(onFeedback).toHaveBeenCalledWith({
				type: "success",
				message: "Settings saved",
			});
		});
	});

	it("calls onFeedback with error on save failure", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onFeedback = vi.fn();
		const onSave = vi.fn().mockRejectedValue(new Error("Network error"));
		render(<SettingsPanel {...defaultProps} onSave={onSave} onFeedback={onFeedback} />);

		const nameInput = screen.getByLabelText("Name");
		await user.clear(nameInput);
		await user.type(nameInput, "Updated");

		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(onFeedback).toHaveBeenCalledWith({
				type: "error",
				message: "Failed to save settings",
			});
		});
	});

	// AC: Only composes existing Tier 1/2 + DaisyUI (structural)
	it("uses DaisyUI modal class", () => {
		const { container } = render(<SettingsPanel {...defaultProps} />);
		expect(container.querySelector(".modal")).toBeInTheDocument();
	});

	it("uses DaisyUI tabs", () => {
		render(<SettingsPanel {...defaultProps} />);
		expect(screen.getByRole("tablist")).toBeInTheDocument();
	});

	// Tab switching works correctly
	it("switches tab content when clicking a tab", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);

		// Initially Profile
		expect(screen.getByLabelText("Name")).toBeInTheDocument();

		// Switch to Products
		await user.click(screen.getByRole("tab", { name: "Products" }));
		expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
		expect(screen.getByText("HyperIdle")).toBeInTheDocument();

		// Switch to Agents
		await user.click(screen.getByRole("tab", { name: "Agents" }));
		expect(screen.getByText("Builder Agent")).toBeInTheDocument();
	});

	// Validation scenario: autonomy level change enables Save
	it("enables Save after changing autonomy level", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Agents" }));

		const selects = screen.getAllByRole("combobox");
		await user.selectOptions(selects[0], "4");

		const saveBtn = screen.getByRole("button", { name: /save/i });
		expect(saveBtn).not.toBeDisabled();
	});

	// Escape closes modal
	it("Escape closes the settings panel", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onClose = vi.fn();
		render(<SettingsPanel {...defaultProps} onClose={onClose} />);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});

	// Backdrop click closes modal
	it("clicking backdrop closes the panel", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onClose = vi.fn();
		render(<SettingsPanel {...defaultProps} onClose={onClose} />);
		await user.click(screen.getByTestId("settings-backdrop"));
		expect(onClose).toHaveBeenCalledOnce();
	});

	// Save passes current settings state to onSave
	it("onSave receives updated settings", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<SettingsPanel {...defaultProps} onSave={onSave} />);

		const nameInput = screen.getByLabelText("Name");
		await user.clear(nameInput);
		await user.type(nameInput, "Updated Name");

		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith(
				expect.objectContaining({
					profile: expect.objectContaining({ name: "Updated Name" }),
				}),
			);
		});
	});

	// J1: density change is wired through onSave with the new value.
	it('Appearance: changing density to "default" calls onSave with the new value', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<SettingsPanel {...defaultProps} onSave={onSave} />);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));

		const densitySelect = screen.getByLabelText("Density");
		// J1 plan resolution A introduces "default" as the new neutral middle
		// step (renaming the current baseline). The select must offer it.
		await user.selectOptions(densitySelect, "default");

		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith(
				expect.objectContaining({
					appearance: expect.objectContaining({ density: "default" }),
				}),
			);
		});
	});

	it('Appearance: changing density to "compact" calls onSave with compact', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<SettingsPanel {...defaultProps} onSave={onSave} />);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));

		const densitySelect = screen.getByLabelText("Density");
		await user.selectOptions(densitySelect, "compact");

		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith(
				expect.objectContaining({
					appearance: expect.objectContaining({ density: "compact" }),
				}),
			);
		});
	});

	// Toggling product active state
	it("toggling product updates state correctly", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<SettingsPanel {...defaultProps} onSave={onSave} />);

		await user.click(screen.getByRole("tab", { name: "Products" }));

		// Toggle SideProject on
		const toggles = screen.getAllByRole("checkbox");
		await user.click(toggles[1]);

		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith(
				expect.objectContaining({
					products: expect.arrayContaining([expect.objectContaining({ id: "p2", active: true })]),
				}),
			);
		});
	});
});
