/**
 * Stories for CredentialsTab — HTTP-backed 4-slot catalog (AH1).
 *
 * AH1: Component now reads from /api/credentials via apiFetch.
 * Stories mock global fetch to simulate different credential states.
 */

import type { JSX } from "react";
import { useEffect } from "react";
import { CredentialsTab } from "./CredentialsTab.js";

export default { title: "CredentialsTab", tier: "settings" as const };

type CatalogEntry = { name: string; state: string; lastValidatedAt: null };

const ALL_CATALOG: readonly string[] = [
	"anthropic_api_key",
	"openrouter_api_key",
	"shared_backend_key",
	"openai_compatible_api_key",
];

function buildCatalog(overrides: Record<string, string>): CatalogEntry[] {
	return ALL_CATALOG.map((name) => ({
		name,
		state: overrides[name] ?? "absent",
		lastValidatedAt: null,
	}));
}

function withMockedFetch(catalog: CatalogEntry[], Component: () => JSX.Element): () => JSX.Element {
	return function WithMockedFetch(): JSX.Element {
		useEffect(() => {
			const originalFetch = window.fetch;
			window.fetch = (url: RequestInfo | URL, opts?: RequestInit): Promise<Response> => {
				const urlStr = typeof url === "string" ? url : url.toString();
				if (urlStr.includes("/api/credentials") && (!opts?.method || opts.method === "GET")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(catalog),
						text: () => Promise.resolve(JSON.stringify(catalog)),
					} as unknown as Response);
				}
				// PUT/DELETE/validate: always succeed
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ state: "present_untested" }),
					text: () => Promise.resolve('{"state":"present_untested"}'),
				} as unknown as Response);
			};
			return () => {
				window.fetch = originalFetch;
			};
		}, []);
		return <Component />;
	};
}

export const AllAbsent = withMockedFetch(buildCatalog({}), CredentialsTab);

export const MixedStates = withMockedFetch(
	buildCatalog({
		anthropic_api_key: "valid",
		openrouter_api_key: "present_untested",
		shared_backend_key: "absent",
		openai_compatible_api_key: "invalid",
	}),
	CredentialsTab,
);

export const AllValid = withMockedFetch(
	buildCatalog({
		anthropic_api_key: "valid",
		openrouter_api_key: "valid",
		shared_backend_key: "valid",
		openai_compatible_api_key: "valid",
	}),
	CredentialsTab,
);

export const AllInvalid = withMockedFetch(
	buildCatalog({
		anthropic_api_key: "invalid",
		openrouter_api_key: "invalid",
		shared_backend_key: "invalid",
		openai_compatible_api_key: "invalid",
	}),
	CredentialsTab,
);
