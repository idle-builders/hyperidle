/**
 * SetupFlow harness picker — component tests.
 *
 * AC1: Harness picker renders all descriptors; choosability gated on discovery.state.
 * AC4b: key PUT precedes nav + nav target /work?onboarding=true (ordering kept).
 * AC5: graceful degrade — discovery failing must not block setup.
 *
 * @lore The always-present built-in gateway row this file was written around is
 * gone. It used to be the default selection, the fallback when discovery failed,
 * and the reason primaryHarness could be omitted from the team POST. All three
 * are now answered by the discovered harnesses themselves.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../pages/SetupFlow";

// ── Stub descriptors ──────────────────────────────────────────────────────────

function makeDescriptor(
	type: string,
	name: string,
	state: HarnessCapabilityDescriptor["discovery"]["state"],
	models: HarnessCapabilityDescriptor["models"] = [],
): HarnessCapabilityDescriptor {
	return {
		type,
		acceptsApiKey: false,
		name,
		kind: "local",
		authAction: { kind: "native_cli_login", label: "Sign in", command: [`${type}`, "login"] },
		discovery: { state, version: undefined },
		models,
		modelProviders: [],
	};
}

/** A second ready harness, so "the first choosable row" is a real choice. */
const OPENCODE_READY: HarnessCapabilityDescriptor = makeDescriptor(
	"opencode",
	"OpenCode",
	"ready",
	[
		{
			id: "openrouter/z-ai/glm-4.7-flash",
			label: "GLM 4.7 Flash",
			provider: "openrouter",
			selectable: true,
			options: [],
		},
	],
);

/** opencode before it has a login: the row that asks for a key. */
const OPENCODE_NEEDS_KEY: HarnessCapabilityDescriptor = {
	...makeDescriptor("opencode", "OpenCode", "unauthenticated"),
	acceptsApiKey: true,
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
};

const CLAUDE_CODE_READY: HarnessCapabilityDescriptor = makeDescriptor(
	"claude-code",
	"Claude Code",
	"ready",
	[
		{
			id: "claude-haiku",
			label: "Haiku",
			provider: "anthropic",
			selectable: true,
			options: [],
		},
	],
);

const CODEX_MISSING: HarnessCapabilityDescriptor = makeDescriptor("codex", "Codex", "missing");

// ── Route stub ────────────────────────────────────────────────────────────────

function WorkOverviewStub(): React.JSX.Element {
	const location = useLocation();
	return (
		<div data-testid="work-page">
			work
			<span data-testid="current-search">{location.search}</span>
		</div>
	);
}

// ── Mock helpers ──────────────────────────────────────────────────────────────

interface MockOptions {
	/** Harness descriptors returned by GET /api/harnesses */
	descriptors?: HarnessCapabilityDescriptor[];
	/** If true, GET /api/harnesses returns a non-ok response */
	discoveryFails?: boolean;
	/** If true, GET /api/harnesses promise never resolves (slow) */
	discoveryHangs?: boolean;
}

/**
 * Set up global.fetch mock. Returns two call-order helpers: credentialCallIndex
 * (the 0-based position of the PUT /api/credentials call among all fetch calls).
 */
function setupFetchMock(opts: MockOptions = {}): {
	getCallOrder: () => Array<{ url: string; method: string }>;
} {
	const callOrder: Array<{ url: string; method: string }> = [];

	global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
		const method = (options?.method ?? "GET").toUpperCase();
		callOrder.push({ url, method });

		if (method === "GET" && url.includes("/api/harnesses")) {
			if (opts.discoveryHangs) return new Promise(() => {});
			if (opts.discoveryFails) {
				return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
			}
			const descriptors = opts.descriptors ?? [OPENCODE_READY];
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => descriptors,
			});
		}

		// All other calls succeed generically
		return Promise.resolve({
			ok: true,
			status: 201,
			json: async () => ({
				user: { id: "u-1", name: "Alice" },
				team: { id: "team-1", name: "My Team", phase: "build" },
				teamMembers: { id: "tm-1" },
			}),
		});
	}) as typeof fetch;

	return { getCallOrder: () => callOrder };
}

function renderSetupFlow(initialPath = "/setup"): void {
	render(
		<MemoryRouter initialEntries={[initialPath]}>
			<Routes>
				<Route path="/setup" element={<SetupFlow />} />
				<Route path="/work" element={<WorkOverviewStub />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ── AC1: All harnesses render; choosability gated on state ───────────────────

describe("harness picker renders all descriptors", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders two choosable ready rows + a greyed missing row", async () => {
		setupFetchMock({
			descriptors: [OPENCODE_READY, CLAUDE_CODE_READY, CODEX_MISSING],
		});
		renderSetupFlow();

		// All three rows must appear
		await waitFor(() => {
			expect(screen.getByText("OpenCode")).toBeInTheDocument();
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
			expect(screen.getByText("Codex")).toBeInTheDocument();
		});
	});

	it("greyed missing row is NOT selectable (codex)", async () => {
		setupFetchMock({
			descriptors: [OPENCODE_READY, CLAUDE_CODE_READY, CODEX_MISSING],
		});
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("Codex")).toBeInTheDocument();
		});

		// The codex row should be aria-disabled
		const codexRow = screen.getByTestId("harness-row-codex");
		expect(codexRow).toHaveAttribute("aria-disabled", "true");
	});

	it("greyed missing row shows install hint", async () => {
		setupFetchMock({
			descriptors: [OPENCODE_READY, CODEX_MISSING],
		});
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("Codex")).toBeInTheDocument();
		});

		// The greyed row has an "install to use" affordance
		expect(screen.getByTestId("harness-row-codex")).toHaveTextContent(/install/i);
	});

	// @lore The default used to be the built-in gateway — the one row guaranteed
	// to be there. Discovery now decides: the form opens on the first harness this
	// machine can actually run, so it never opens on a name that is not here.
	it("the first choosable row is default-selected (radio)", async () => {
		setupFetchMock({
			descriptors: [OPENCODE_READY, CLAUDE_CODE_READY],
		});
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("OpenCode")).toBeInTheDocument();
		});

		expect(screen.getByTestId("harness-radio-opencode")).toBeChecked();
	});

	it("clicking a choosable row selects it as primary", async () => {
		const user = userEvent.setup();
		setupFetchMock({
			descriptors: [OPENCODE_READY, CLAUDE_CODE_READY],
		});
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("harness-radio-claude-code"));
		expect(screen.getByTestId("harness-radio-claude-code")).toBeChecked();
		expect(screen.getByTestId("harness-radio-opencode")).not.toBeChecked();
	});

	it("clicking a greyed row does NOT select it", async () => {
		const user = userEvent.setup();
		setupFetchMock({
			descriptors: [OPENCODE_READY, CODEX_MISSING],
		});
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("Codex")).toBeInTheDocument();
		});

		// Click on the codex row — the ready harness should remain selected
		await user.click(screen.getByText("Codex"));
		expect(screen.getByTestId("harness-radio-opencode")).toBeChecked();
	});
});

// ── AC5: Graceful degrade when discovery fails ────────────────────────────────

describe("harness picker graceful degrade", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// @lore A failed probe is not the same fact as "no harness is installed", and
	// setup must not treat it as one. There is no row to fall back to any more, so
	// the degrade is: render no rows, block nothing, and let the person continue —
	// the alternative would strand someone over a probe error. The genuine
	// "nothing can run here" case is a populated list with nothing choosable in it,
	// covered in setup-blocks-with-no-harness.test.tsx.
	it("renders no harness rows when GET /api/harnesses fails", async () => {
		setupFetchMock({ discoveryFails: true });
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
		});
		expect(screen.queryByTestId("harness-radio-opencode")).not.toBeInTheDocument();
		expect(screen.queryByTestId("no-harness-available")).not.toBeInTheDocument();
	});

	it("Start button still enables on a name alone when discovery fails", async () => {
		const user = userEvent.setup();
		setupFetchMock({ discoveryFails: true });
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).not.toBeDisabled();
	});
});

// ── AC4b: Key PUT precedes nav + auto-open kept ───────────────────────────────

describe("setup submit ordering — key write before nav", () => {
	beforeEach(() => {
		vi.stubGlobal("__HYPERIDLE__", undefined);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("PUT /api/credentials call precedes navigate to /work?onboarding=true", async () => {
		const user = userEvent.setup();
		const { getCallOrder } = setupFetchMock({
			descriptors: [OPENCODE_NEEDS_KEY],
		});
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await waitFor(() => {
			expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
		});
		await user.type(screen.getByLabelText(/api key/i), "sk-ant-test");
		await user.type(screen.getByLabelText(/^model/i), "claude-opus-5");

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		// Verify nav target includes onboarding=true
		const searchEl = screen.getByTestId("current-search");
		expect(searchEl.textContent).toContain("onboarding=true");

		// Verify PUT /api/credentials is in call sequence before nav (which triggers work-page render)
		const calls = getCallOrder();
		const credIndex = calls.findIndex(
			(c) => c.method === "PUT" && c.url.includes("/api/credentials"),
		);
		const teamsIndex = calls.findIndex((c) => c.method === "POST" && c.url.includes("/api/teams"));
		expect(credIndex).toBeGreaterThan(-1);
		expect(teamsIndex).toBeGreaterThan(-1);
		// credentials must come after teams (teams first, then creds, then nav)
		expect(credIndex).toBeGreaterThan(teamsIndex);
	});

	it("primaryHarness is included in POST /api/teams body when a ready harness is selected", async () => {
		const user = userEvent.setup();
		let capturedTeamsBody: Record<string, unknown> | null = null;

		global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
			if ((options?.method?.toUpperCase() ?? "GET") === "GET" && url.includes("/api/harnesses")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => [OPENCODE_READY, CLAUDE_CODE_READY],
				});
			}
			if ((options?.method?.toUpperCase() ?? "") === "POST" && url.includes("/api/teams")) {
				try {
					capturedTeamsBody = JSON.parse(options?.body as string) as Record<string, unknown>;
				} catch {
					// ignore
				}
			}
			return Promise.resolve({
				ok: true,
				status: 201,
				json: async () => ({
					user: { id: "u-1" },
					team: { id: "team-1", name: "My Team", phase: "build" },
					teamMembers: { id: "tm-1" },
				}),
			});
		}) as typeof fetch;

		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		// Select the claude-code row
		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("harness-radio-claude-code"));

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		expect(capturedTeamsBody).not.toBeNull();
		const phRaw = (capturedTeamsBody as unknown as Record<string, unknown>)["primaryHarness"];
		expect(phRaw).toBeDefined();
		const ph = phRaw as Record<string, unknown>;
		expect(ph.harnessType).toBe("claude-code");
	});

	// @lore This used to assert the opposite: builtin was the server-side default,
	// so choosing it meant sending nothing and letting the server fill it in. There
	// is no default harness to fall back to now, so the chosen one is always named.
	it("primaryHarness names the chosen harness even when it is the only one", async () => {
		const user = userEvent.setup();
		let capturedTeamsBody: Record<string, unknown> | null = null;

		global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
			if ((options?.method?.toUpperCase() ?? "GET") === "GET" && url.includes("/api/harnesses")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => [OPENCODE_READY],
				});
			}
			if ((options?.method?.toUpperCase() ?? "") === "POST" && url.includes("/api/teams")) {
				try {
					capturedTeamsBody = JSON.parse(options?.body as string) as Record<string, unknown>;
				} catch {
					// ignore
				}
			}
			return Promise.resolve({
				ok: true,
				status: 201,
				json: async () => ({
					user: { id: "u-1" },
					team: { id: "team-1", name: "My Team", phase: "build" },
					teamMembers: { id: "tm-1" },
				}),
			});
		}) as typeof fetch;

		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		await waitFor(() => {
			expect(screen.getByTestId("harness-row-opencode")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		expect(capturedTeamsBody).not.toBeNull();
		const ph = capturedTeamsBody?.["primaryHarness"] as Record<string, unknown> | undefined;
		expect(ph?.harnessType).toBe("opencode");
	});
});

// ── W1: isCode client-side decision — code vs doc_set based on inspect-path result ──

describe("SetupFlow filesystem kind decision (isCode client logic)", () => {
	beforeEach(() => {
		vi.stubGlobal("__HYPERIDLE__", undefined);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	/**
	 * Build a fetch mock that:
	 * - GET /api/harnesses → a single ready harness descriptor
	 * - POST /api/filesystems/inspect-path → the provided inspect result
	 * - POST /api/users, POST /api/teams, PUT /api/credentials → success stubs
	 * - POST /api/filesystems → success + captures the request body
	 */
	function setupFetchMockWithInspect(
		inspectResult: { exists: boolean; isGitRepo: boolean; branch: string | null },
		captureRef: { body: Record<string, unknown> | null },
	): void {
		global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
			const method = (options?.method ?? "GET").toUpperCase();

			if (method === "GET" && url.includes("/api/harnesses")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => [OPENCODE_READY],
				});
			}

			if (method === "POST" && url.includes("/api/filesystems/inspect-path")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => inspectResult,
				});
			}

			if (method === "POST" && url.includes("/api/filesystems")) {
				try {
					captureRef.body = JSON.parse(options?.body as string) as Record<string, unknown>;
				} catch {
					// ignore
				}
				return Promise.resolve({
					ok: true,
					status: 201,
					json: async () => ({ id: "fs-1" }),
				});
			}

			// Default stub for users, teams, credentials
			return Promise.resolve({
				ok: true,
				status: 201,
				json: async () => ({
					user: { id: "u-1", name: "Alice" },
					team: { id: "team-1", name: "My Team", phase: "build" },
					teamMembers: { id: "tm-1" },
				}),
			});
		}) as typeof fetch;
	}

	it("git repo with resolvable branch → POST /api/filesystems body has kind:'code' with branch", async () => {
		const user = userEvent.setup();
		const captureRef: { body: Record<string, unknown> | null } = { body: null };

		setupFetchMockWithInspect({ exists: true, isGitRepo: true, branch: "main" }, captureRef);

		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		// Type a folder path — SetupFlow re-inspects on submit if folderInfo is null/stale
		await user.type(screen.getByRole("textbox", { name: /folder/i }), "/home/alice/myrepo");

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		// Assert: client used kind:"code" (branch was resolvable)
		expect(captureRef.body).not.toBeNull();
		expect(captureRef.body?.["kind"]).toBe("code");
		const ref = captureRef.body?.["resourceRef"] as Record<string, unknown> | undefined;
		expect(ref?.["branch"]).toBe("main");
		expect(captureRef.body?.["writeback"]).toBe("none");
	});

	it("git repo with no resolvable branch (null) → POST /api/filesystems body has kind:'doc_set', not 400", async () => {
		const user = userEvent.setup();
		const captureRef: { body: Record<string, unknown> | null } = { body: null };

		// Empty-branch case: isGitRepo=true but branch=null (no commits yet)
		setupFetchMockWithInspect({ exists: true, isGitRepo: true, branch: null }, captureRef);

		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		await user.type(screen.getByRole("textbox", { name: /folder/i }), "/home/alice/empty-repo");

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		// Assert: client degraded to kind:"doc_set" (no branch → no 400)
		expect(captureRef.body).not.toBeNull();
		expect(captureRef.body?.["kind"]).toBe("doc_set");
		// Must NOT have sent kind:"code" with an empty branch (that would 400)
		const ref = captureRef.body?.["resourceRef"] as Record<string, unknown> | undefined;
		expect(ref?.["branch"]).toBeUndefined();
		expect(captureRef.body?.["writeback"]).toBe("none");
	});
});
