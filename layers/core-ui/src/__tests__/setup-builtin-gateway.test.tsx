/**
 * SetupFlow built-in gateway credential entry — component tests.
 *
 * The setup form no longer carries a standalone, Anthropic-hardcoded API key
 * field. Key entry belongs to the built-in gateway row inside the harness
 * picker, and the built-in gateway speaks all three ModelProviders.
 *
 * AC1: no key field outside the built-in harness row.
 * AC2: the built-in row offers every ModelProvider.
 * AC3: the key is written to the credential matching the chosen provider.
 * AC4: choosing a non-anthropic provider also points the gateway tiers at it,
 *      so the stored key is actually reachable at runtime.
 * AC5: openrouter model choices come from the live catalog, not a hardcoded list.
 * AC6: an openai-compatible provider collects the baseUrl its resolver requires.
 * AC7: a CLI harness brings its own auth — no key entry, no credential write.
 * AC8: a built-in gateway already holding a credential needs no key re-entry.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../pages/SetupFlow";

// ── Descriptors ───────────────────────────────────────────────────────────────

function builtinDescriptor(
	state: HarnessCapabilityDescriptor["discovery"]["state"],
): HarnessCapabilityDescriptor {
	return {
		type: "builtin",
		name: "Built-in gateway",
		kind: "remote",
		authAction: { kind: "enter_api_key", label: "Enter API key" },
		discovery: { state },
		models: [],
		modelProviders: ["anthropic"],
	};
}

const CLAUDE_CODE_READY: HarnessCapabilityDescriptor = {
	type: "claude-code",
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

async function awaitBuiltinRow(): Promise<HTMLElement> {
	await waitFor(() => {
		expect(screen.getByTestId("harness-row-builtin")).toBeInTheDocument();
	});
	return screen.getByTestId("harness-row-builtin");
}

function credentialPut(calls: RecordedCall[]): RecordedCall | undefined {
	return calls.find((c) => c.method === "PUT" && c.url.includes("/api/credentials/"));
}

function gatewayPatch(calls: RecordedCall[]): RecordedCall | undefined {
	return calls.find((c) => c.method === "PATCH" && c.url.includes("/api/model-gateway"));
}

afterEach(() => {
	vi.restoreAllMocks();
});

// ── AC1 + AC2: key entry lives on the built-in row and is provider-agnostic ───

describe("built-in gateway credential entry", () => {
	it("renders no API key field outside the built-in harness row", async () => {
		setupFetchMock([builtinDescriptor("unauthenticated")]);
		renderSetupFlow();

		const builtinRow = await awaitBuiltinRow();
		const keyField = screen.getByLabelText(/api key/i);
		expect(builtinRow).toContainElement(keyField);
	});

	it("names no provider in the field label until one is chosen by the user", async () => {
		setupFetchMock([builtinDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitBuiltinRow();

		// The pre-change form hardcoded "Anthropic API key" as the only option.
		const providerSelect = screen.getByLabelText(/provider/i);
		expect(providerSelect).toBeInTheDocument();
	});

	it("offers every model provider the built-in gateway can call", async () => {
		setupFetchMock([builtinDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitBuiltinRow();

		const providerSelect = screen.getByLabelText(/provider/i);
		const values = Array.from(providerSelect.querySelectorAll("option")).map((o) => o.value);
		expect(values).toContain("anthropic");
		expect(values).toContain("openrouter");
		expect(values).toContain("openai-compatible");
	});

	it("keeps Start disabled until the built-in gateway has a key", async () => {
		const user = userEvent.setup();
		setupFetchMock([builtinDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitBuiltinRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		expect(startButton()).toBeDisabled();

		await user.type(screen.getByLabelText(/api key/i), "sk-ant-test");
		expect(startButton()).not.toBeDisabled();
	});
});

// ── AC3 + AC4: the key lands on the right credential, tiers follow ────────────

describe("provider choice drives credential + gateway config", () => {
	it("writes anthropic_api_key and leaves the default tiers alone", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([builtinDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitBuiltinRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.type(screen.getByLabelText(/api key/i), "sk-ant-test");
		await user.click(startButton());

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		const put = credentialPut(calls);
		expect(put?.url).toContain("/api/credentials/anthropic_api_key");
		expect(put?.body?.value).toBe("sk-ant-test");
		// Built-in tier defaults are already anthropic — nothing to reconfigure.
		expect(gatewayPatch(calls)).toBeUndefined();
	});

	it("writes openrouter_api_key and points every tier at the chosen model", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([builtinDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitBuiltinRow();

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

		const patch = gatewayPatch(calls);
		expect(patch).toBeDefined();
		for (const tier of ["reasoning", "workhorse", "fast"]) {
			const tierBody = patch?.body?.[tier] as Record<string, unknown> | undefined;
			expect(tierBody?.provider).toBe("openrouter");
			expect(tierBody?.model).toBe("anthropic/claude-opus-5");
		}
	});

	it("collects the baseUrl an openai-compatible provider requires", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([builtinDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitBuiltinRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.selectOptions(screen.getByLabelText(/provider/i), "openai-compatible");

		// Both the endpoint and the model are free text for an arbitrary provider.
		await user.type(screen.getByLabelText(/base url/i), "https://api.together.xyz/v1");
		await user.type(screen.getByLabelText(/^model/i), "meta-llama/Llama-3-70b");
		await user.type(screen.getByLabelText(/api key/i), "sk-together-test");

		await user.click(startButton());
		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		const put = credentialPut(calls);
		expect(put?.url).toContain("/api/credentials/openai_compatible_api_key");

		const patch = gatewayPatch(calls);
		const workhorse = patch?.body?.workhorse as Record<string, unknown> | undefined;
		expect(workhorse?.provider).toBe("openai-compatible");
		expect(workhorse?.baseUrl).toBe("https://api.together.xyz/v1");
		expect(workhorse?.model).toBe("meta-llama/Llama-3-70b");
	});

	it("blocks Start until an openai-compatible provider has both baseUrl and model", async () => {
		const user = userEvent.setup();
		setupFetchMock([builtinDescriptor("unauthenticated")]);
		renderSetupFlow();
		await awaitBuiltinRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.selectOptions(screen.getByLabelText(/provider/i), "openai-compatible");
		await user.type(screen.getByLabelText(/api key/i), "sk-together-test");
		expect(startButton()).toBeDisabled();

		await user.type(screen.getByLabelText(/base url/i), "https://api.together.xyz/v1");
		expect(startButton()).toBeDisabled();

		await user.type(screen.getByLabelText(/^model/i), "meta-llama/Llama-3-70b");
		expect(startButton()).not.toBeDisabled();
	});

	it("degrades to a typed model when the openrouter catalog is unreachable", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([builtinDescriptor("unauthenticated")], {
			openRouterFails: true,
		});
		renderSetupFlow();
		await awaitBuiltinRow();

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

		const patch = gatewayPatch(calls);
		const fast = patch?.body?.fast as Record<string, unknown> | undefined;
		expect(fast?.provider).toBe("openrouter");
		expect(fast?.model).toBe("anthropic/claude-opus-5");
	});
});

// ── AC7 + AC8: no key needed when auth already exists ─────────────────────────

describe("harnesses that already hold their own auth", () => {
	it("hides key entry and needs no credential when a CLI harness is chosen", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([builtinDescriptor("unauthenticated"), CLAUDE_CODE_READY]);
		renderSetupFlow();
		await awaitBuiltinRow();

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

	it("needs no key when the built-in gateway already resolved a credential", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock([builtinDescriptor("ready")]);
		renderSetupFlow();
		await awaitBuiltinRow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		expect(startButton()).not.toBeDisabled();

		await user.click(startButton());
		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});
		expect(credentialPut(calls)).toBeUndefined();
	});
});
