/**
 * L1 — Autonomy Schema (red phase, web).
 *
 * Pins the SettingsPanel ladder contract from `docs/plans/L1.md` Decision 5:
 *   - The autonomy `<select>` enumerates four options L1..L4 in order.
 *   - Each option text starts with the `Lx` code from AUTONOMY_LEVEL_META.
 *   - Selecting an option emits a NUMERIC `level` to onSave (not a 3-state string).
 *
 * This file is additive — `SettingsPanel.test.tsx` keeps its legacy 3-state
 * assertions until step 3 (write-code) rewrites them. That separation lets
 * red phase produce a clean failing diff for the new contract without
 * yet-undefined behavior breaking the unrelated tabs.
 *
 * MUST fail against `main`: the AgentSetting.autonomyLevel field is currently
 * the string union "manual" | "supervised" | "autonomous" — passing a number
 * is a compile error AND the rendered options are the 3-state legacy text.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { AutonomyLevel } from "@hyperidle/shared";
import { type SettingsData, SettingsPanel } from "../components/SettingsPanel";

const ladderSettings: SettingsData = {
	profile: { name: "F", email: "f@x", avatarUrl: "" },
	products: [{ id: "p1", name: "P", active: true }],
	agents: [
		// Numeric levels per the new ladder. If the type is still the legacy
		// string union, this object literal is a TypeScript error — that's the
		// red-phase signal at the type level.
		{ id: "a1", name: "Architect", autonomyLevel: 2, paused: false },
		{ id: "a2", name: "Growth", autonomyLevel: 4, paused: false },
	],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedProducts: [],
	},
	appearance: { density: "comfortable", theme: "system" },
};

describe("L1: SettingsPanel autonomy ladder", () => {
	const onSave = vi.fn().mockResolvedValue(undefined);
	const defaultProps = {
		open: true,
		onClose: vi.fn(),
		onSave,
		settings: ladderSettings,
	};

	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		onSave.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("AutonomyLevel from @hyperidle/shared is the numeric ladder 1|2|3|4", () => {
		expectTypeOf<AutonomyLevel>().toEqualTypeOf<1 | 2 | 3 | 4>();
	});

	it("renders four options on the autonomy <select> in L1..L4 order", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Agents" }));

		const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
		const autonomy = selects[0];
		const optionTexts = Array.from(autonomy.options).map((o) => o.text);

		expect(optionTexts).toHaveLength(4);
		expect(optionTexts[0]).toMatch(/^L1\b/);
		expect(optionTexts[1]).toMatch(/^L2\b/);
		expect(optionTexts[2]).toMatch(/^L3\b/);
		expect(optionTexts[3]).toMatch(/^L4\b/);
	});

	it("option labels include the descriptive ladder semantics", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Agents" }));

		const select = (screen.getAllByRole("combobox") as HTMLSelectElement[])[0];
		const optionTexts = Array.from(select.options).map((o) => o.text.toLowerCase());

		// Spec semantics from TRACK-L L1:
		expect(optionTexts[0]).toContain("asks every step");
		expect(optionTexts[1]).toContain("asks before commit");
		expect(optionTexts[2]).toMatch(/low-risk|high-risk/);
		expect(optionTexts[3]).toContain("autonomous");
	});

	it("the option <option value> is the numeric level (1..4 as string)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Agents" }));

		const select = (screen.getAllByRole("combobox") as HTMLSelectElement[])[0];
		const values = Array.from(select.options).map((o) => o.value);
		expect(values).toEqual(["1", "2", "3", "4"]);
	});

	it("selected value reflects the seeded numeric autonomyLevel (2)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Agents" }));

		const select = (screen.getAllByRole("combobox") as HTMLSelectElement[])[0];
		expect(select.value).toBe("2");
	});

	it("changing the select emits a numeric level into onSave (not a string)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Agents" }));

		const select = (screen.getAllByRole("combobox") as HTMLSelectElement[])[0];
		await user.selectOptions(select, "3");

		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(onSave).toHaveBeenCalled();
		});

		const lastCall = onSave.mock.calls.at(-1);
		expect(lastCall).toBeDefined();
		const passed = lastCall?.[0] as SettingsData;
		const architect = passed.agents.find((a) => a.id === "a1");
		expect(architect?.autonomyLevel).toBe(3);
		expect(typeof architect?.autonomyLevel).toBe("number");
	});

	it("changing to L4 yields the literal 4 in the saved payload", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Agents" }));

		const select = (screen.getAllByRole("combobox") as HTMLSelectElement[])[0];
		await user.selectOptions(select, "4");

		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			const lastCall = onSave.mock.calls.at(-1);
			expect(lastCall).toBeDefined();
			const passed = lastCall?.[0] as SettingsData;
			const architect = passed.agents.find((a) => a.id === "a1");
			expect(architect?.autonomyLevel).toBe(4);
		});
	});

	it("rejects the legacy 3-state strings at the type level (compile-time guard)", () => {
		// This block exists to PIN the type guarantee. If `AgentSetting.autonomyLevel`
		// silently widens back to a string union, this object literal becomes
		// assignable and the test loses its teeth. The `expectTypeOf` line is
		// the actual structural assertion; the value below is just a smoke test.
		// @ts-expect-error — string literal not assignable to ladder type.
		const bad: SettingsData["agents"][number] = {
			id: "x",
			name: "x",
			autonomyLevel: "manual",
			paused: false,
		};
		expect(bad.autonomyLevel).toBe("manual");
	});
});
