/**
 * W2 — SettingsAppearance density removal test (AC-7).
 *
 * AC-7: SettingsAppearance renders only a theme selector.
 *       No density selector exists in the DOM.
 *
 * These tests FAIL in the red phase because SettingsAppearance
 * currently renders both a density select and a theme select.
 */

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the hooks used by SettingsAppearance
vi.mock("../hooks/useTheme.js", () => ({
	useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

vi.mock("../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

// After density strip, useDensity import must be removed from SettingsAppearance.
// This test will fail at import time if SettingsAppearance still imports useDensity
// (because useDensity.ts will be deleted). For the red phase, the mock below
// is defensive — once useDensity.ts is deleted the mock won't matter.
vi.mock("../hooks/useDensity.js", () => ({
	useDensity: () => ({ density: "auto", setDensity: vi.fn() }),
}));

import { SettingsAppearance } from "../settings/SettingsAppearance.js";

describe("W2 AC-7 — SettingsAppearance theme-only layout", () => {
	it("renders the theme selector", () => {
		render(<SettingsAppearance />);
		expect(screen.getByLabelText(/theme/i)).toBeInTheDocument();
	});

	it("does NOT render a density selector", () => {
		render(<SettingsAppearance />);
		expect(screen.queryByLabelText(/density/i)).toBeNull();
	});

	it("does NOT render a density-select element by id", () => {
		const { container } = render(<SettingsAppearance />);
		expect(container.querySelector("#density-select")).toBeNull();
	});

	it("theme select has light, dark, and system options", () => {
		render(<SettingsAppearance />);
		const themeSelect = screen.getByLabelText(/theme/i);
		expect(themeSelect).toBeInTheDocument();
		// Options: Light, Dark, System
		const options = themeSelect.querySelectorAll("option");
		const optionValues = Array.from(options).map((o) => (o as HTMLOptionElement).value);
		expect(optionValues).toContain("light");
		expect(optionValues).toContain("dark");
		expect(optionValues).toContain("system");
	});

	it("renders only one select element (theme only, no density)", () => {
		const { container } = render(<SettingsAppearance />);
		const selects = container.querySelectorAll("select");
		expect(
			selects.length,
			"SettingsAppearance must render exactly one select (theme only, not density+theme)",
		).toBe(1);
	});
});
