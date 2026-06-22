/**
 * AM4 RED — HarnessCard component tests (Task 8, AC2/AC3)
 *
 * AC2: Toggle IS present (getByRole("switch")) for ready/installed/unauthenticated
 *      Toggle ABSENT (queryByRole("switch") null) for builtin/missing/unavailable
 *      Flipping toggle fires POST /api/harnesses/:type/disabled
 *      AC2-production-shape: ready descriptor with all-false caps shows
 *        "confirmed after first run" and NOT "File editing: No"/"MCP: No" etc.
 * AC3: unauthenticated card renders auth zone with action button + mono command
 *      unavailable card renders reason, NO action button
 *
 * FAILS until:
 *  - packages/web/src/settings/HarnessCard.tsx is created
 *  - Uses label-less Toggle variant from DS
 *  - Calls POST /api/harnesses/:type/disabled on toggle flip
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HarnessCard } from "../HarnessCard.js";

// ── Fixtures (same production shape from design) ─────────────────────────────

const ALL_CAPS_FALSE = {
	preCompactionTrigger: false,
	subAgents: false,
	mcpSupport: false,
	modelProviders: ["anthropic"],
	fileEditing: false,
	toolUse: false,
};

const READY_DESCRIPTOR = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local" as const,
	accessMode: "provider-subscription-cli" as const,
	authAction: {
		kind: "native_cli_login" as const,
		label: "Log in to Claude Code",
		command: ["claude", "auth", "login"],
	},
	discovery: { state: "ready" as const, version: "2.1.178" },
	models: [
		{
			id: "claude-sonnet-4-6",
			label: "Claude Sonnet 4.6",
			provider: "anthropic" as const,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
	],
	runtime: ALL_CAPS_FALSE,
	modelProviders: ["anthropic"],
};

const READY_DISABLED_DESCRIPTOR = {
	...READY_DESCRIPTOR,
	type: "codex",
	name: "Codex",
	authAction: {
		kind: "native_cli_login" as const,
		label: "Log in to Codex",
		command: ["codex", "login"],
	},
	discovery: {
		state: "ready" as const,
		version: "0.141.0",
		disabled: true,
		reason: "Turned off by user.",
	},
};

const UNAUTHENTICATED_DESCRIPTOR = {
	...READY_DESCRIPTOR,
	type: "codex",
	name: "Codex",
	authAction: {
		kind: "native_cli_login" as const,
		label: "Log in to Codex",
		command: ["codex", "login"],
	},
	discovery: { state: "unauthenticated" as const, version: "0.141.0" },
};

const INSTALLED_DESCRIPTOR = {
	...READY_DESCRIPTOR,
	type: "opencode",
	name: "OpenCode",
	authAction: {
		kind: "native_cli_login" as const,
		label: "Log in to OpenCode",
		command: ["opencode", "providers", "login"],
	},
	discovery: { state: "installed" as const, version: "1.17.8" },
};

const MISSING_DESCRIPTOR = {
	...READY_DESCRIPTOR,
	type: "codex",
	name: "Codex",
	authAction: {
		kind: "native_cli_login" as const,
		label: "Log in to Codex",
		command: ["codex", "login"],
	},
	discovery: { state: "missing" as const, reason: "Not installed." },
	models: [],
};

const UNAVAILABLE_DESCRIPTOR = {
	...READY_DESCRIPTOR,
	type: "cursor-agent",
	name: "Cursor Agent",
	authAction: { kind: "none" as const, label: "Configured in Cursor app" },
	discovery: {
		state: "unavailable" as const,
		reason: "No documented headless CLI surface.",
	},
	models: [],
};

const BUILTIN_DESCRIPTOR = {
	...READY_DESCRIPTOR,
	type: "builtin",
	name: "Built-in",
	accessMode: "api-gateway" as const,
	authAction: {
		kind: "enter_api_key" as const,
		label: "Enter API key",
		credentialNames: ["anthropic_api_key"],
	},
	discovery: { state: "ready" as const },
	runtime: { ...ALL_CAPS_FALSE, modelProviders: ["anthropic", "openrouter"] },
	modelProviders: ["anthropic", "openrouter"],
};

// ── AC2: Toggle presence ──────────────────────────────────────────────────────

describe("AM4 AC2 — HarnessCard Toggle presence", () => {
	it("Toggle IS present for ready descriptor", () => {
		render(<HarnessCard descriptor={READY_DESCRIPTOR} onToggle={vi.fn()} />);
		expect(screen.getByRole("switch")).toBeInTheDocument();
	});

	it("Toggle IS present for unauthenticated descriptor", () => {
		render(<HarnessCard descriptor={UNAUTHENTICATED_DESCRIPTOR} onToggle={vi.fn()} />);
		expect(screen.getByRole("switch")).toBeInTheDocument();
	});

	it("Toggle IS present for installed descriptor", () => {
		render(<HarnessCard descriptor={INSTALLED_DESCRIPTOR} onToggle={vi.fn()} />);
		expect(screen.getByRole("switch")).toBeInTheDocument();
	});

	it("Toggle ABSENT for builtin (NOT disableable — founder rule)", () => {
		render(<HarnessCard descriptor={BUILTIN_DESCRIPTOR} onToggle={vi.fn()} />);
		expect(screen.queryByRole("switch")).toBeNull();
	});

	it("Toggle ABSENT for missing", () => {
		render(<HarnessCard descriptor={MISSING_DESCRIPTOR} onToggle={vi.fn()} />);
		expect(screen.queryByRole("switch")).toBeNull();
	});

	it("Toggle ABSENT for unavailable", () => {
		render(<HarnessCard descriptor={UNAVAILABLE_DESCRIPTOR} onToggle={vi.fn()} />);
		expect(screen.queryByRole("switch")).toBeNull();
	});

	it("Toggle is ON (checked) for enabled ready descriptor", () => {
		render(<HarnessCard descriptor={READY_DESCRIPTOR} onToggle={vi.fn()} />);
		const toggle = screen.getByRole("switch");
		// Toggle should be on/checked when not disabled
		expect(toggle).toBeChecked();
	});

	it("Toggle is OFF (not checked) for disabled ready descriptor", () => {
		render(<HarnessCard descriptor={READY_DISABLED_DESCRIPTOR} onToggle={vi.fn()} />);
		const toggle = screen.getByRole("switch");
		expect(toggle).not.toBeChecked();
	});
});

// ── AC2: Toggle fires POST on flip ────────────────────────────────────────────

describe("AM4 AC2 — HarnessCard Toggle fires POST /api/harnesses/:type/disabled", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => [],
			}),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("flipping toggle calls onToggle callback with the new disabled state", async () => {
		const onToggle = vi.fn();
		const user = userEvent.setup();

		render(<HarnessCard descriptor={READY_DESCRIPTOR} onToggle={onToggle} />);
		const toggle = screen.getByRole("switch");
		await user.click(toggle);

		// onToggle must be called (component fires the callback that triggers POST)
		expect(onToggle).toHaveBeenCalledWith("claude-code", true);
	});

	it("flipping disabled toggle calls onToggle with disabled=false", async () => {
		const onToggle = vi.fn();
		const user = userEvent.setup();

		render(<HarnessCard descriptor={READY_DISABLED_DESCRIPTOR} onToggle={onToggle} />);
		const toggle = screen.getByRole("switch");
		await user.click(toggle);

		// Was off → flipping → disabled=false (enabling it)
		expect(onToggle).toHaveBeenCalledWith("codex", false);
	});
});

// ── AC2-production-shape: all-false caps renders correctly ────────────────────

describe("AM4 AC2-production-shape — ready descriptor with all-false runtime caps", () => {
	it("shows 'confirmed after first run' in the capabilities area", async () => {
		const user = userEvent.setup();
		render(<HarnessCard descriptor={READY_DESCRIPTOR} onToggle={vi.fn()} />);

		// Find and open the capabilities fold (if present)
		const foldTrigger = screen.queryByRole("button", { name: /models|hide/i });
		if (foldTrigger) {
			await user.click(foldTrigger);
		}

		await waitFor(() => {
			expect(screen.getByText(/confirmed after first run/i)).toBeInTheDocument();
		});
	});

	it("does NOT show 'File editing: No' or 'MCP: No' or wall-of-no for all-false caps", async () => {
		const user = userEvent.setup();
		render(<HarnessCard descriptor={READY_DESCRIPTOR} onToggle={vi.fn()} />);

		const foldTrigger = screen.queryByRole("button", { name: /models|hide/i });
		if (foldTrigger) {
			await user.click(foldTrigger);
		}

		// These "No" rows must NOT appear (design R2 — no wall of "No")
		expect(screen.queryByText(/file editing.*no/i)).toBeNull();
		expect(screen.queryByText(/mcp.*no/i)).toBeNull();
		expect(screen.queryByText(/sub-agents.*no/i)).toBeNull();
	});
});

// ── AC3: Unauthenticated shows actionable next step ───────────────────────────

describe("AM4 AC3 — HarnessCard unauthenticated shows actionable next step", () => {
	it("renders auth zone with action button labeled with authAction.label", () => {
		render(<HarnessCard descriptor={UNAUTHENTICATED_DESCRIPTOR} onToggle={vi.fn()} />);
		// Primary CTA button with the auth label must be present
		expect(screen.getByRole("button", { name: /log in to codex/i })).toBeInTheDocument();
	});

	it("renders the mono CLI command (codex login)", () => {
		render(<HarnessCard descriptor={UNAUTHENTICATED_DESCRIPTOR} onToggle={vi.fn()} />);
		// The command text must appear as copyable code
		expect(screen.getByText("codex login")).toBeInTheDocument();
	});
});

// ── AC3: Unavailable — reason, no CTA ────────────────────────────────────────

describe("AM4 AC3 — HarnessCard unavailable shows reason, no action button", () => {
	it("renders the unavailable reason", () => {
		render(<HarnessCard descriptor={UNAVAILABLE_DESCRIPTOR} onToggle={vi.fn()} />);
		expect(screen.getByText(/no documented headless cli surface/i)).toBeInTheDocument();
	});

	it("does NOT render an auth action button for unavailable", () => {
		render(<HarnessCard descriptor={UNAVAILABLE_DESCRIPTOR} onToggle={vi.fn()} />);
		// No "Configured in Cursor app" button (label is for the config info, not an action)
		expect(screen.queryByRole("button", { name: /configured in cursor/i })).toBeNull();
	});
});
