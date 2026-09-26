/**
 * W3 — Settings AC-47 through AC-52: Red phase tests.
 *
 * AC-47: Stacked single-page layout (all sections visible, scrollable).
 * AC-48: "Save profile" button text (lowercase p).
 * AC-49: "Org chart" section label (lowercase c).
 * AC-50: Theme selector as visual swatch cards (not a <select>).
 * AC-51: "Backend" section showing mode.
 * AC-52: Content max-width 680px, centered.
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
// AC-47: Stacked single-page layout
// ---------------------------------------------------------------------------
describe("W3 AC-47 — Settings stacked single-page layout", () => {
	it("renders SettingsPage component with data-testid='settings-page'", () => {
		renderSettingsPage();
		// Fails until SettingsPage has this testid
		expect(screen.getByTestId("settings-page")).toBeInTheDocument();
	});

	it("Profile section visible (data-testid='settings-section-profile')", () => {
		renderSettingsPage();
		expect(screen.getByTestId("settings-section-profile")).toBeInTheDocument();
	});

	it("keeps a section title close to the content it names", () => {
		renderSettingsPage();
		const section = screen.getByTestId("settings-section-profile");
		const gap = /\bgap-\[(\d+)px\]/.exec(section.className);
		expect(Number(gap?.[1])).toBeGreaterThanOrEqual(6);
		expect(Number(gap?.[1])).toBeLessThanOrEqual(9);
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
// AC-48: "Save profile" button text
// ---------------------------------------------------------------------------
describe("W3 AC-48 — Save profile button text", () => {
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
// AC-49: "Org chart" section label
// ---------------------------------------------------------------------------
describe("W3 AC-49 — Org chart section label", () => {
	it("renders org chart section with lowercase 'Org chart' title", () => {
		renderSettingsPage();
		const orgSection = screen.getByTestId("settings-section-org-chart");
		const heading = orgSection.querySelector("h2, h3, [data-section-title]");
		expect(heading).not.toBeNull();
		expect(heading?.textContent?.trim()).toBe("Org chart");
	});
});

// ---------------------------------------------------------------------------
// AC-50: Theme selector as visual swatch cards
// ---------------------------------------------------------------------------
describe("W3 AC-50 — Theme swatch cards (not select)", () => {
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
		expect(lightCard).not.toBeNull();
	});

	it("renders a Dark swatch card", () => {
		render(
			<MemoryRouter>
				<SettingsAppearance />
			</MemoryRouter>,
		);
		const darkCard = document.querySelector("[data-theme-option='dark'], [data-theme='dark']");
		expect(darkCard).not.toBeNull();
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
		expect(systemCard).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-51: "Backend" section showing mode
// ---------------------------------------------------------------------------
describe("W3 AC-51 — Backend section showing mode", () => {
	it("renders a Backend section", () => {
		renderSettingsPage();
		expect(screen.getByTestId("settings-section-backend")).toBeInTheDocument();
	});

	it("Backend section shows mode text (Web, Local, or Shared)", () => {
		// AF15 AC-3: SettingsBackend now derives mode from window.__HYPERIDLE__
		// instead of hardcoding isLocal=true. In the test environment there is no
		// bridge, so resolveBackendState() returns "web" → label "Web".
		renderSettingsPage();
		const backendSection = screen.getByTestId("settings-section-backend");
		expect(backendSection).toHaveTextContent(/mode/i);
		expect(backendSection).toHaveTextContent(/web|local|shared/i);
	});
});

// ---------------------------------------------------------------------------
// AC-52: Settings content max-width — one measure for the whole page
//
// @lore FR-9: Redesigned from per-section centered lanes to a single 720px
// left-aligned body container. One max-width on the body, shared by all
// sections, gives one left edge that aligns with the PageHeader title.
// mx-auto on the body would create a different left edge from the title
// (centered vs left-aligned at the PageFrame edge).
// ---------------------------------------------------------------------------
describe("W3 AC-52 — Settings lanes", () => {
	it("settings-body holds the single 720px constraint; sections inherit width", () => {
		renderSettingsPage();
		const settingsBody = document.querySelector("[data-testid='settings-body']");
		const profile = document.querySelector("[data-testid='settings-section-profile']");
		const agents = document.querySelector("[data-testid='settings-section-agents']");
		// Body holds the width constraint — single measure, no mx-auto (left-aligned with title)
		expect(settingsBody?.className).toMatch(/max-w-\[720px\]/);
		expect(settingsBody?.className).not.toMatch(/mx-auto/);
		// Individual sections inherit width from body — no per-section max-w or mx-auto
		expect(profile?.className).not.toMatch(/max-w-/);
		expect(profile?.className).not.toMatch(/mx-auto/);
		expect(agents?.className).not.toMatch(/max-w-/);
		expect(agents?.className).not.toMatch(/mx-auto/);
	});
});
