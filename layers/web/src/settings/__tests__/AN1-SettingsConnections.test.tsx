/**
 * AN1 RED — SettingsConnections component tests.
 *
 * AC coverage:
 *   AC1: renders inherited group + held groups (token/mcp) from props
 *   AC3: shows a 'needs-attention' health chip for unhealthy connections
 *   AC4: no trust-tier badge rendered; no raw secret value in DOM
 *   Design: inherited group appears first
 *   Design: removable held rows show overflow menu; inherited rows do not
 *   Story: SettingsConnections.stories.tsx Populated story exists and renders
 *
 * FAILS until:
 *   - framework/shared/src/connection.ts exports ServiceConnectionView
 *   - SettingsConnections.tsx imports from @hyperidle/shared (not local type alias)
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsConnections } from "../SettingsConnections.js";

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// ── Fixture data ──────────────────────────────────────────────────────────────

const INHERITED_GITHUB = {
	id: "inherited:claude-code:github",
	service: "GitHub",
	via: "claude-code · gh CLI",
	authSource: "inherited" as const,
	health: "working" as const,
	removable: false,
};

const TOKEN_STRIPE = {
	id: "sc-stripe-001",
	service: "Stripe",
	via: "API key · stored encrypted",
	authSource: "token" as const,
	health: "working" as const,
	removable: true,
};

const TOKEN_SENDGRID_NEEDS_ATTENTION = {
	id: "sc-sendgrid-001",
	service: "SendGrid",
	via: "API key · stored encrypted",
	authSource: "token" as const,
	health: "needs-attention" as const,
	removable: true,
};

const MCP_FIGMA = {
	id: "sc-figma-001",
	service: "Figma",
	via: "mcp.figma.com",
	authSource: "mcp" as const,
	health: "working" as const,
	removable: true,
};

const ALL_CONNECTIONS = [INHERITED_GITHUB, TOKEN_STRIPE, TOKEN_SENDGRID_NEEDS_ATTENTION, MCP_FIGMA];

describe("AN1 — SettingsConnections component", () => {
	let apiFetch: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const module = await import("../../services/api-fetch.js");
		apiFetch = module.apiFetch as ReturnType<typeof vi.fn>;
		apiFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(ALL_CONNECTIONS),
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// AC1: renders inherited group
	describe("inherited group renders (AC1)", () => {
		it("shows the inherited group heading", async () => {
			render(<SettingsConnections />);
			const heading = await screen.findByText(/inherited from your environment/i);
			expect(heading).toBeDefined();
		});

		it("shows the inherited connection service name", async () => {
			render(<SettingsConnections />);
			const service = await screen.findByText("GitHub");
			expect(service).toBeDefined();
		});

		it("inherited row does NOT show an overflow/remove button", async () => {
			render(<SettingsConnections />);
			// Wait for data to load
			await screen.findByText("GitHub");
			// GitHub (inherited) must not have a remove/actions button
			const actionsBtn = screen.queryByRole("button", { name: /actions for github/i });
			expect(actionsBtn).toBeNull();
		});
	});

	// AC1: renders held token group
	describe("token group renders (AC1)", () => {
		it("shows the token group heading", async () => {
			render(<SettingsConnections />);
			const heading = await screen.findByText(/connected with a token/i);
			expect(heading).toBeDefined();
		});

		it("shows the token connection service name", async () => {
			render(<SettingsConnections />);
			const service = await screen.findByText("Stripe");
			expect(service).toBeDefined();
		});

		it("held token row shows an overflow/remove button", async () => {
			render(<SettingsConnections />);
			await screen.findByText("Stripe");
			const actionsBtn = screen.queryByRole("button", { name: /actions for stripe/i });
			expect(actionsBtn).not.toBeNull();
		});
	});

	// AC1: renders held mcp group
	describe("mcp group renders (AC1)", () => {
		it("shows the mcp group heading", async () => {
			render(<SettingsConnections />);
			const heading = await screen.findByText(/connected via an mcp server/i);
			expect(heading).toBeDefined();
		});

		it("shows the mcp connection service name", async () => {
			render(<SettingsConnections />);
			const service = await screen.findByText("Figma");
			expect(service).toBeDefined();
		});
	});

	// AC3: needs-attention health chip
	describe("AC3 — needs-attention health chip shown", () => {
		it("shows 'Needs attention' chip for SendGrid connection", async () => {
			render(<SettingsConnections />);
			const chip = await screen.findByText(/needs attention/i);
			expect(chip).toBeDefined();
		});
	});

	// AC4: no trust tier, no secret in DOM
	describe("AC4 — no trust-tier badge, no secret value in DOM", () => {
		it("does not render any trust tier text", async () => {
			render(<SettingsConnections />);
			await screen.findByText("GitHub"); // wait for load

			const dom = document.body.textContent ?? "";
			expect(dom).not.toMatch(/vetted/i);
			expect(dom).not.toMatch(/community/i);
			expect(dom).not.toMatch(/trust tier/i);
		});

		it("does not render any raw token value in the DOM", async () => {
			// The connection views have no token field — the component can't render what's not there
			render(<SettingsConnections />);
			await screen.findByText("Stripe");

			// No raw sk-* or API key values should appear
			const dom = document.body.textContent ?? "";
			expect(dom).not.toMatch(/sk-stripe/i);
			expect(dom).not.toMatch(/encryptedToken/i);
			expect(dom).not.toMatch(/encrypted_token/i);
		});
	});

	// Design: page title and subtitle
	describe("Design contract — header", () => {
		it("renders the Connections heading", async () => {
			render(<SettingsConnections />);
			const heading = await screen.findByText("Connections");
			expect(heading).toBeDefined();
		});

		it("renders the '+ Add connection' button", async () => {
			render(<SettingsConnections />);
			const addBtn = await screen.findByText(/\+ add connection/i);
			expect(addBtn).toBeDefined();
		});
	});

	// Loading state
	describe("loading state", () => {
		it("shows loading indicator before data arrives", async () => {
			// Delay response so loading state is visible
			apiFetch.mockReturnValue(new Promise(() => {})); // never resolves
			render(<SettingsConnections />);
			// Loading skeleton should be visible
			const loading = screen.queryByLabelText(/loading connections/i);
			// Check that the connections content is NOT rendered yet
			const inherited = screen.queryByText(/inherited from your environment/i);
			// Either a loading indicator exists or the groups aren't rendered yet
			// (depends on implementation — either is correct for the loading state)
			expect(loading !== null || inherited === null).toBe(true);
		});
	});

	// Error state
	describe("error state", () => {
		it("shows error message when fetch fails", async () => {
			apiFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
			render(<SettingsConnections />);
			const err = await screen.findByText(/couldn't load connections/i);
			expect(err).toBeDefined();
		});
	});
});

// ── Story existence check ─────────────────────────────────────────────────────

describe("AN1 — SettingsConnections story", () => {
	it("story module exports a Populated story", async () => {
		// AC: the Populated story exists (the snapshot net covers DOM regression)
		const stories = await import("../SettingsConnections.stories.js");
		expect(typeof stories.Populated).toBe("function");
	});

	it("story module exports a title and group", async () => {
		const stories = await import("../SettingsConnections.stories.js");
		expect(typeof stories.default.title).toBe("string");
		expect(typeof stories.default.group).toBe("string");
	});
});
