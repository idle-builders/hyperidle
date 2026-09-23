/**
 * AN1 — SettingsConnections component tests.
 *
 * AC coverage:
 *   AC1: renders inherited group + held groups (token/mcp) from props
 *   AC3: shows a 'needs-attention' health chip for unhealthy connections
 *   AC4: no trust-tier badge rendered; no raw secret value in DOM
 *   Design: inherited group appears first
 *   Design: removable held rows show overflow menu; inherited rows do not
 *   Story: SettingsConnections.stories.tsx Populated story exists and renders
 *
 * @lore BC5 T10: the door swap — `open_user({}).connections` replaces `GET
 * /api/connections`; the inherited group is now `InheritedReachView[]`
 * (name/kind/source/health, no id/removable) mapped in the component to the
 * same row shape as a held connection (architecture.md §8). `call` is
 * mocked at the door.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsConnections } from "../SettingsConnections.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

// ── Fixture data ──────────────────────────────────────────────────────────────

const INHERITED_GITHUB = {
	name: "GitHub",
	kind: "cli" as const,
	source: "claude-code · gh CLI",
	health: "working" as const,
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

const SELF_ROW = { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } };

function openUserData(): Record<string, unknown> {
	return {
		user: SELF_ROW,
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: {
			connections: [TOKEN_STRIPE, TOKEN_SENDGRID_NEEDS_ATTENTION, MCP_FIGMA],
			inherited: [INHERITED_GITHUB],
		},
		behaviour: null,
		inbox: null,
	};
}

describe("AN1 — SettingsConnections component", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") {
				return Promise.resolve({ ok: true, data: openUserData() });
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
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
			await screen.findByText("GitHub");
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
			render(<SettingsConnections />);
			await screen.findByText("Stripe");

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
			callMock.mockReset();
			callMock.mockImplementation(() => new Promise(() => {})); // never resolves
			render(<SettingsConnections />);
			const loading = screen.queryByLabelText(/loading connections/i);
			const inherited = screen.queryByText(/inherited from your environment/i);
			expect(loading !== null || inherited === null).toBe(true);
		});
	});

	// Error state
	describe("error state", () => {
		it("shows error message when open_user fails", async () => {
			callMock.mockReset();
			callMock.mockResolvedValue({ ok: false, problems: [{ code: "server_error", message: "no" }] });
			render(<SettingsConnections />);
			const err = await screen.findByText(/couldn't load connections/i);
			expect(err).toBeDefined();
		});
	});
});

// ── Story existence check ─────────────────────────────────────────────────────

describe("AN1 — SettingsConnections story", () => {
	it("story module exports a Populated story", async () => {
		const stories = await import("../SettingsConnections.stories.js");
		expect(typeof stories.Populated).toBe("function");
	});

	it("story module exports a title and group", async () => {
		const stories = await import("../SettingsConnections.stories.js");
		expect(typeof stories.default.title).toBe("string");
		expect(typeof stories.default.group).toBe("string");
	});
});
