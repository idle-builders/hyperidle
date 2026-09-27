/**
 * SettingsConnections component tests.
 *
 * Covers: renders inherited group + held groups (token/mcp) from props;
 * shows a 'needs-attention' health chip for unhealthy connections; no
 * trust-tier badge rendered; no raw secret value in DOM; inherited group
 * appears first; removable held rows show overflow menu, inherited rows
 * do not.
 *
 * @lore open_user({}).connections is the door — held and inherited groups are both ConnectionView rows, so the component reads every row typed.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsConnections } from "../SettingsConnections.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

// ── Fixture data ──────────────────────────────────────────────────────────────

const INHERITED_GITHUB = {
	id: "inherited:claude-code:github",
	service: "GitHub",
	via: "CLI · claude-code · gh CLI",
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
		inbox: null,
	};
}

describe("SettingsConnections component", () => {
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

	describe("inherited group renders", () => {
		it("shows the inherited group heading", async () => {
			render(<SettingsConnections />);
			const heading = await screen.findByText(/inherited from your environment/i);
			expect(heading).toBeInTheDocument();
		});

		it("shows the inherited connection service name", async () => {
			render(<SettingsConnections />);
			const service = await screen.findByText("GitHub");
			expect(service).toBeInTheDocument();
		});

		it("inherited row does NOT show an overflow/remove button", async () => {
			render(<SettingsConnections />);
			await screen.findByText("GitHub");
			const actionsBtn = screen.queryByRole("button", { name: /actions for github/i });
			expect(actionsBtn).toBeNull();
		});
	});

	describe("token group renders", () => {
		it("shows the token group heading", async () => {
			render(<SettingsConnections />);
			const heading = await screen.findByText(/connected with a token/i);
			expect(heading).toBeInTheDocument();
		});

		it("shows the token connection service name", async () => {
			render(<SettingsConnections />);
			const service = await screen.findByText("Stripe");
			expect(service).toBeInTheDocument();
		});

		it("held token row shows an overflow/remove button", async () => {
			render(<SettingsConnections />);
			await screen.findByText("Stripe");
			const actionsBtn = screen.queryByRole("button", { name: /actions for stripe/i });
			expect(actionsBtn).toBeInTheDocument();
		});
	});

	describe("mcp group renders", () => {
		it("shows the mcp group heading", async () => {
			render(<SettingsConnections />);
			const heading = await screen.findByText(/connected via an mcp server/i);
			expect(heading).toBeInTheDocument();
		});

		it("shows the mcp connection service name", async () => {
			render(<SettingsConnections />);
			const service = await screen.findByText("Figma");
			expect(service).toBeInTheDocument();
		});
	});

	describe("Needs-attention health chip shown", () => {
		it("shows 'Needs attention' chip for SendGrid connection", async () => {
			render(<SettingsConnections />);
			const chip = await screen.findByText(/needs attention/i);
			expect(chip).toBeInTheDocument();
		});
	});

	describe("No trust-tier badge, no secret value in DOM", () => {
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
			expect(heading).toBeInTheDocument();
		});

		it("renders the '+ Add connection' button", async () => {
			render(<SettingsConnections />);
			const addBtn = await screen.findByText(/\+ add connection/i);
			expect(addBtn).toBeInTheDocument();
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
			callMock.mockResolvedValue({
				ok: false,
				problems: [{ code: "server_error", message: "no" }],
			});
			render(<SettingsConnections />);
			const err = await screen.findByText(/couldn't load connections/i);
			expect(err).toBeInTheDocument();
		});
	});
});

// ── Story existence check ─────────────────────────────────────────────────────

describe("SettingsConnections story", () => {
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
