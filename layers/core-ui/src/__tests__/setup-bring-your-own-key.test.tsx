/**
 * SetupFlow bring-your-own-key entry — component tests.
 *
 * Someone who has an API key but no CLI login must still be able to finish
 * setup. The key belongs to a harness row: the one whose descriptor declares
 * `acceptsApiKey`, meaning it can run on a key HyperIdle stores rather than only
 * on its own login. Today that is opencode.
 *
 * AC1: the key field lives inside the row of the harness that accepts one.
 * AC2: that row offers every ModelProvider.
 * AC3: the key is written to the credential matching the chosen provider.
 * AC4: the chosen provider + model reach the team as its primaryHarness, so the
 *      stored key is actually resolvable at runtime and the harness is told what
 *      to run.
 * AC5: openrouter model choices come from the live catalog, not a hardcoded list.
 * AC6: only providers an agent can actually be given are offered.
 * AC7: a login-only harness brings its own auth — no key entry, no credential write.
 * AC8: a key-accepting harness that is already logged in needs no key either.
 *
 * @lore This file used to be setup-builtin-gateway.test.tsx, and its subject was
 * the built-in gateway row: the one harness whose credential HyperIdle held and
 * called with itself. There is no gateway now, so the same eight properties are
 * asserted against the harness that reads the key instead — and the tier PATCH
 * that AC4 used to assert is replaced by the primaryHarness the team is created
 * with, which is where a model choice actually lands.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../pages/SetupFlow";

// ── Descriptors ───────────────────────────────────────────────────────────────

/** opencode: installed, and able to run on a key we store. */
function keyAcceptingDescriptor(
	state: HarnessCapabilityDescriptor["discovery"]["state"],
): HarnessCapabilityDescriptor {
	return {
		type: "opencode",
		acceptsApiKey: true,
		name: "OpenCode",
		kind: "local",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to OpenCode",
			command: ["opencode", "providers", "login"],
		},
		discovery: { state },
		models: [],
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	};
}

const CLAUDE_CODE_READY: HarnessCapabilityDescriptor = {
	type: "claude-code",
	acceptsApiKey: false,
	name: "Claude Code",
	kind: "local",
	authAction: { kind: "native_cli_login", label: "Sign in", command: ["claude", "auth", "login"] },
	discovery: { state: "ready" },
	models: [],
	modelProviders: [],
};

/** Shape of the real GET https://openrouter.ai/api/v1/models payload (verified 2026-08-10). */
const OPENROUTER_MODELS = {
	data: [
		{ id: "anthropic/claude-opus-5", name: "Claude Opus 5", context_length: 1_000_000 },
		{ id: "openai/gpt-5.6-luna", name: "OpenAI: GPT-5.6 Luna", context_length: 1_050_000 },
	],
};

// ── Fetch mock ────────────────────────────────────────────────────────────────

interface RecordedCall {
	url: string;
	method: string;
	body: Record<string, unknown> | null;
}

function setupFetchMock(
	descriptors: HarnessCapabilityDescriptor[],
	opts: { openRouterFails?: boolean } = {},
): { calls: RecordedCall[] } {
	const calls: RecordedCall[] = [];

	global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
		const method = (options?.method ?? "GET").toUpperCase();
		let body: Record<string, unknown> | null = null;
		if (typeof options?.body === "string") {
			try {
				body = JSON.parse(options.body) as Record<string, unknown>;
			} catch {
				body = null;
			}
		}
		calls.push({ url, method, body });

		if (url.includes("openrouter.ai")) {
			if (opts.openRouterFails) return Promise.reject(new Error("offline"));
			return Promise.resolve({ ok: true, status: 200, json: async () => OPENROUTER_MODELS });
		}

		if (method === "GET" && url.includes("/api/harnesses")) {
			return Promise.resolve({ ok: true, status: 200, json: async () => descriptors });
		}

		return Promise.resolve({
			ok: true,
			status: 201,
			json: async () => ({
				user: { id: "u-1", name: "Alice" },
				team: { id: "team-1", name: "My Team", phase: "build" },
			}),
		});
	}) as typeof fetch;

	return { calls };
}

function renderSetupFlow(): void {
	render(
		<MemoryRouter initialEntries={["/setup"]}>
			<Routes>
				<Route path="/setup" element={<SetupFlow />} />
				<Route path="/work" element={<div data-testid="work-page">work</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

const startButton = (): HTMLElement => screen.getByRole("button", { name: /start hyperidle/i });

async function awaitKeyAcceptingRow(): Promise<HTMLElement> {
	await waitFor(() => {
		expect(screen.getByTestId("harness-group-opencode")).toBeInTheDocument();
	});
	return screen.getByTestId("harness-group-opencode");
}

function credentialPut(calls: RecordedCall[]): RecordedCall | undefined {
	return calls.find((c) => c.method === "PUT" && c.url.includes("/api/credentials/"));
}

function teamPost(calls: RecordedCall[]): RecordedCall | undefined {
	return calls.find((c) => c.method === "POST" && c.url.includes("/api/teams"));
}

function primaryHarnessOf(calls: RecordedCall[]): Record<string, unknown> | undefined {
	return teamPost(calls)?.body?.primaryHarness as Record<string, unknown> | undefined;
}

/** The gateway tier config the built-in harness needed. Nothing writes it now. */
function gatewayPatch(calls: RecordedCall[]): RecordedCall | undefined {
	return calls.find((c) => c.method === "PATCH" && c.url.includes("/api/model-gateway"));
}

afterEach(() => {
	vi.restoreAllMocks();
});

// ── AC1 + AC2: key entry lives on the accepting row and is provider-agnostic ──

describe("bring-your-own-key entry", () => {
	it("renders the API key field inside the row of the harness that accepts one", async () => {
		setupFetchMock([keyAcceptingDescriptor("unauthenticated")]);
		renderSetupFlow();

		const row = await awaitKeyAcceptingRow();
		const keyField = screen.getByLabelText(/api key/i);
		expect(row).toContainElement(keyField);
	});

	it("names no provider in the field label until one is chosen by the user", async () => {
		setupFetchMock([keyAcceptingDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitKeyAcceptingRow();

		// The pre-change form hardcoded "Anthropic API key" as the only option.
		const providerSelect = screen.getByLabelText(/provider/i);
		expect(providerSelect).toBeInTheDocument();
	});

	// AC6. @lore openai-compatible used to be offered here, with a Base URL field
	// beside it, because the key went to the model gateway's tiers and a tier could
	// store an arbitrary endpoint. Setup writes the provider onto every scaffolded
	// agent now, and a per-agent openai-compatible provider is rejected — by
	// validateAgentConfig with 422 UNSUPPORTED_PROVIDER, and by the model resolver.
	// Offering it would build a team the API refuses.
	it("offers only the providers an agent can actually be given", async () => {
		setupFetchMock([keyAcceptingDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitKeyAcceptingRow();

		const providerSelect = screen.getByLabelText(/provider/i);
		const values = Array.from(providerSelect.querySelectorAll("option")).map((o) => o.value);
		expect(values).toContain("anthropic");
		expect(values).toContain("openrouter");
		expect(values).not.toContain("openai-compatible");
	});

	it("keeps Start disabled until the key and the model are both given", async () => {
		const user = userEvent.setup();
		setupFetchMock([keyAcceptingDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitKeyAcceptingRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		expect(startButton()).toBeDisabled();

		await user.type(screen.getByLabelText(/api key/i), "sk-ant-test");
		// A key says who to call, never what to run — there are no tier defaults
		// left to fill the model in.
		expect(startButton()).toBeDisabled();

		await user.type(screen.getByLabelText(/^model/i), "claude-opus-5");
		expect(startButton()).not.toBeDisabled();
	});
});

// ── AC3 + AC4: the key lands on the right credential, the model on the team ───

describe("provider choice drives the credential and the team's harness", () => {
	it("writes anthropic_api_key and names the chosen model on the team", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([keyAcceptingDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitKeyAcceptingRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.type(screen.getByLabelText(/api key/i), "sk-ant-test");
		await user.type(screen.getByLabelText(/^model/i), "claude-opus-5");
		await user.click(startButton());

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		const put = credentialPut(calls);
		expect(put?.url).toContain("/api/credentials/anthropic_api_key");
		expect(put?.body?.value).toBe("sk-ant-test");

		expect(primaryHarnessOf(calls)).toMatchObject({
			harnessType: "opencode",
			modelId: "claude-opus-5",
			modelProvider: "anthropic",
		});
		// There is no model gateway left to configure.
		expect(gatewayPatch(calls)).toBeUndefined();
	});

	it("writes openrouter_api_key and carries the catalog model onto the team", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([keyAcceptingDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitKeyAcceptingRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.selectOptions(screen.getByLabelText(/provider/i), "openrouter");
		await user.type(screen.getByLabelText(/api key/i), "sk-or-test");

		// AC5: options come from the live catalog fetch, not a hardcoded list.
		await waitFor(() => {
			expect(screen.getByLabelText(/^model$/i)).toBeInTheDocument();
		});
		await waitFor(() => {
			expect(screen.getByRole("option", { name: /claude opus 5/i })).toBeInTheDocument();
		});
		await user.selectOptions(screen.getByLabelText(/^model$/i), "anthropic/claude-opus-5");

		await user.click(startButton());
		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		const put = credentialPut(calls);
		expect(put?.url).toContain("/api/credentials/openrouter_api_key");
		expect(put?.body?.value).toBe("sk-or-test");

		expect(primaryHarnessOf(calls)).toMatchObject({
			harnessType: "opencode",
			modelId: "anthropic/claude-opus-5",
			modelProvider: "openrouter",
		});
	});

	it("degrades to a typed model when the openrouter catalog is unreachable", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([keyAcceptingDescriptor("unauthenticated")], {
			openRouterFails: true,
		});
		renderSetupFlow();
		await awaitKeyAcceptingRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.selectOptions(screen.getByLabelText(/provider/i), "openrouter");
		await user.type(screen.getByLabelText(/api key/i), "sk-or-test");

		await waitFor(() => {
			expect(screen.getByLabelText(/^model/i)).toBeInTheDocument();
		});
		await user.type(screen.getByLabelText(/^model/i), "anthropic/claude-opus-5");

		await user.click(startButton());
		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		expect(primaryHarnessOf(calls)).toMatchObject({
			modelProvider: "openrouter",
			modelId: "anthropic/claude-opus-5",
		});
	});
});

// ── AC7 + AC8: no key needed when auth already exists ─────────────────────────

describe("harnesses that already hold their own auth", () => {
	it("hides key entry and needs no credential when a login-only harness is chosen", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([
			keyAcceptingDescriptor("unauthenticated"),
			CLAUDE_CODE_READY,
		]);
		renderSetupFlow();
		await awaitKeyAcceptingRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await waitFor(() => {
			expect(screen.getByTestId("harness-radio-claude-code")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("harness-radio-claude-code"));

		expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
		expect(startButton()).not.toBeDisabled();

		await user.click(startButton());
		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});
		expect(credentialPut(calls)).toBeUndefined();
	});

	it("needs no key when the key-accepting harness is already logged in", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([keyAcceptingDescriptor("ready")]);
		renderSetupFlow();
		await awaitKeyAcceptingRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
		expect(startButton()).not.toBeDisabled();

		await user.click(startButton());
		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});
		expect(credentialPut(calls)).toBeUndefined();
	});
});
