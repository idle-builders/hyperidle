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

describe("SettingsAppearance theme-only layout", () => {
	it("renders the theme selector as swatch cards", () => {
		const { container } = render(<SettingsAppearance />);
		// W3 AC-50: theme options are swatch card buttons with aria-label="<Name> theme"
		expect(screen.getByLabelText(/light theme/i)).toBeInTheDocument();
		expect(container.querySelectorAll("[data-theme-option]").length).toBe(3);
	});

	it("does NOT render a density selector", () => {
		render(<SettingsAppearance />);
		expect(screen.queryByLabelText(/density/i)).toBeNull();
	});

	it("does NOT render a density-select element by id", () => {
		const { container } = render(<SettingsAppearance />);
		expect(container.querySelector("#density-select")).toBeNull();
	});

	it("theme swatch cards include light, dark, and system options", () => {
		const { container } = render(<SettingsAppearance />);
		// W3 AC-50: theme options are swatch cards with data-theme-option attribute
		const swatches = container.querySelectorAll("[data-theme-option]");
		const swatchValues = Array.from(swatches).map((s) => s.getAttribute("data-theme-option"));
		expect(swatchValues).toContain("light");
		expect(swatchValues).toContain("dark");
		expect(swatchValues).toContain("system");
	});

	it("renders exactly three swatch cards (no select element)", () => {
		const { container } = render(<SettingsAppearance />);
		// W3 AC-50: swatch card pattern — no <select>, exactly 3 swatch buttons
		const selects = container.querySelectorAll("select");
		expect(selects.length, "SettingsAppearance must not render any <select> elements").toBe(0);
		const swatches = container.querySelectorAll("[data-theme-option]");
		expect(swatches.length, "SettingsAppearance must render exactly 3 swatch cards").toBe(3);
	});
});
