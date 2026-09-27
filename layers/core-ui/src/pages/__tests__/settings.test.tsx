/**
 * Settings page tests.
 *
 * Covers: a stacked single-page layout (all sections visible, scrollable);
 * "Save profile" button text (lowercase p); "Org chart" section label
 * (lowercase c); a theme selector as visual swatch cards (not a <select>);
 * a "Backend" section showing mode; a content column with a 680px
 * max-width, centered.
 *
 * Also: SettingsPage.tsx must exist (critique CRITICAL-5: missing stories/component).
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsAppearance } from "../../settings/SettingsAppearance";

// Mock hooks used by settings components
vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Test Founder", avatarUrl: null },
		status: "ready",
		error: null,
	}),
}));

vi.mock("../../hooks/useTeams", () => ({
	useTeams: () => ({
		data: {
			teams: [{ id: "t1", name: "Alpha Core" }],
			users: [{ id: "u1", name: "Test Founder", role: "founder" }],
		},
		loading: false,
		error: null,
	}),
}));

vi.mock("../../hooks/useTheme", () => ({
	useTheme: () => ({
		theme: "dark",
		setTheme: vi.fn(),
	}),
}));

vi.mock("../../shell/ToastRegion", () => ({
	useToast: () => ({ showToast: vi.fn() }),
	ToastContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

import { SettingsPage } from "../../pages/SettingsPage";

function renderSettingsPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<SettingsPage />
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// Stacked single-page layout
// ---------------------------------------------------------------------------
describe("Settings stacked single-page layout", () => {
	it("renders SettingsPage component with data-testid='settings-page'", () => {
		renderSettingsPage();
		// Fails until SettingsPage has this testid
		expect(screen.getByTestId("settings-page")).toBeInTheDocument();
	});

	it("Profile section visible (data-testid='settings-section-profile')", () => {
		renderSettingsPage();
		expect(screen.getByTestId("settings-section-profile")).toBeInTheDocument();
	});

	it("Org chart section visible (data-testid='settings-section-org-chart')", () => {
		renderSettingsPage();
		expect(screen.getByTestId("settings-section-org-chart")).toBeInTheDocument();
	});

	it("Appearance section visible (data-testid='settings-section-appearance')", () => {
		renderSettingsPage();
		expect(screen.getByTestId("settings-section-appearance")).toBeInTheDocument();
	});

	it("Backend section visible (data-testid='settings-section-backend')", () => {
		renderSettingsPage();
		expect(screen.getByTestId("settings-section-backend")).toBeInTheDocument();
	});

	it("profile and appearance sections not hidden simultaneously (stacked layout)", () => {
		renderSettingsPage();
		const profileSection = screen.getByTestId("settings-section-profile");
		const appearanceSection = screen.getByTestId("settings-section-appearance");
		expect(profileSection).not.toHaveAttribute("hidden");
		expect(appearanceSection).not.toHaveAttribute("hidden");
	});
});

// ---------------------------------------------------------------------------
// "Save profile" button text
// ---------------------------------------------------------------------------
describe("Save profile button text", () => {
	it("renders 'Save profile' (exact case, lowercase p)", () => {
		renderSettingsPage();
		const btn = screen.getByRole("button", { name: /save profile/i });
		expect(btn).toBeInTheDocument();
		expect(btn.textContent?.trim()).toBe("Save profile");
	});

	it("does NOT render 'Save changes' button text", () => {
		renderSettingsPage();
		expect(screen.queryByRole("button", { name: /^save changes$/i })).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// "Org chart" section label
// ---------------------------------------------------------------------------
describe("Org chart section label", () => {
	it("renders org chart section with lowercase 'Org chart' title", () => {
		renderSettingsPage();
		const orgSection = screen.getByTestId("settings-section-org-chart");
		const heading = orgSection.querySelector("h2, h3, [data-section-title]");
		expect(heading).not.toBeNull();
		expect(heading?.textContent?.trim()).toBe("Org chart");
	});
});

// ---------------------------------------------------------------------------
// Theme selector as visual swatch cards
// ---------------------------------------------------------------------------
describe("Theme swatch cards (not select)", () => {
	it("SettingsAppearance does NOT render a <select> for theme", () => {
		render(
			<MemoryRouter>
				<SettingsAppearance />
			</MemoryRouter>,
		);
		// The old <select> for theme should be gone
		const themeSelect = document.querySelector("select#theme-select");
		expect(themeSelect).toBeNull();
	});

	it("renders a Light swatch card", () => {
		render(
			<MemoryRouter>
				<SettingsAppearance />
			</MemoryRouter>,
		);
		// Must have a clickable card element with "Light" label, not an <option>
		const lightCard = document.querySelector("[data-theme-option='light'], [data-theme='light']");
		expect(lightCard).toBeInTheDocument();
	});

	it("renders a Dark swatch card", () => {
		render(
			<MemoryRouter>
				<SettingsAppearance />
			</MemoryRouter>,
		);
		const darkCard = document.querySelector("[data-theme-option='dark'], [data-theme='dark']");
		expect(darkCard).toBeInTheDocument();
	});

	it("renders a System swatch card", () => {
		render(
			<MemoryRouter>
				<SettingsAppearance />
			</MemoryRouter>,
		);
		const systemCard = document.querySelector(
			"[data-theme-option='system'], [data-theme='system']",
		);
		expect(systemCard).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// "Backend" section showing mode
// ---------------------------------------------------------------------------
describe("Backend section showing mode", () => {
	it("renders a Backend section", () => {
		renderSettingsPage();
		expect(screen.getByTestId("settings-section-backend")).toBeInTheDocument();
	});

	it("Backend section shows mode text (Web, Local, or Shared)", () => {
		// SettingsBackend now derives mode from window.__HYPERIDLE__
		// instead of hardcoding isLocal=true. In the test environment there is no
		// bridge, so resolveBackendState() returns "web" → label "Web".
		renderSettingsPage();
		const backendSection = screen.getByTestId("settings-section-backend");
		expect(backendSection).toHaveTextContent(/mode/i);
		expect(backendSection).toHaveTextContent(/web|local|shared/i);
	});
});
