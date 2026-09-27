/**
 * AH5: OpenRouter catalog HTTP layer.
 *
 * Net-new fetchers — no catalog/endpoint fetch code exists elsewhere in eval/.
 * These are deliberately thin (fetch + JSON parse + field-narrowing) so the
 * almost-all logic lives in the pure selectSmokeModel function (testable without
 * a live key).
 *
 * @lore AH5: `throughput_last_30m` and `latency_last_30m` only populate on
 * AUTHENTICATED reads. Always pass the real API key; anonymous reads return null
 * for those fields.
 *
 * @lore AH5: `pricing.*` are per-token USD strings (OpenRouter convention).
 * Multiply × 1e6 to get per-1M USD. If OpenRouter ever changes to per-1M
 * the conversion in selectSmokeModel must drop the multiplication.
 */

// ---------------------------------------------------------------------------
// Public types (verbatim OpenRouter field names)
// ---------------------------------------------------------------------------

/** Verbatim shape of a model entry from GET /api/v1/models. */
export interface OpenRouterModel {
	readonly id: string;
	readonly created: number;
	readonly pricing: {
		readonly prompt: string;
		readonly completion: string;
	};
	/** Model-level union across providers — NOT authoritative for per-provider tool support. */
	readonly supported_parameters?: readonly string[];
	readonly context_length?: number;
}

/** Per-provider endpoint from GET /api/v1/models/{id}/endpoints. */
export interface OpenRouterEndpoint {
	readonly provider_name: string;
	/** Per-provider — authoritative for "tools" gate. */
	readonly supported_parameters: readonly string[];
	readonly pricing: {
		readonly prompt: string;
		readonly completion: string;
	};
	/** 0..1 or null when no data available. */
	readonly uptime_last_30m: number | null;
	/** Percentile throughput objects or null. */
	readonly throughput_last_30m: { readonly p50: number } | null;
	/** Percentile latency objects or null. */
	readonly latency_last_30m: { readonly p50: number } | null;
	readonly status: string;
}

/** Result shape of GET /api/v1/models/{id}/endpoints. */
export interface ModelEndpoints {
	readonly id: string;
	readonly endpoints: readonly OpenRouterEndpoint[];
}

// ---------------------------------------------------------------------------
// Live HTTP fetchers (only called in the local lane which has the key)
// ---------------------------------------------------------------------------

const BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Fetch the OpenRouter model catalog.
 * Only models passing the pre-filter (price, age, free-exclusion) need endpoints fetched.
 *
 * @lore AH5: Returns the `data` array from the models list response.
 */
export async function fetchSmokeCatalog(apiKey: string): Promise<readonly OpenRouterModel[]> {
	const res = await fetch(`${BASE_URL}/models`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
	});
	if (!res.ok) {
		throw new Error(`OpenRouter /models failed: ${res.status} ${res.statusText}`);
	}
	const json = (await res.json()) as { data?: unknown[] };
	if (!(json.data && Array.isArray(json.data))) {
		throw new Error("OpenRouter /models: unexpected response shape (no data array)");
	}
	return narrowModels(json.data);
}

/**
 * Fetch per-provider endpoint data for a single model.
 * Requires authentication to populate throughput/latency fields.
 *
 * @lore AH5 Fix1: encodeURIComponent(modelId) encodes the "/" in "author/slug"
 * as "%2F", making every /endpoints lookup 404. OpenRouter treats author/slug
 * as real path segments — encode each segment independently to preserve the slash.
 */
export async function fetchModelEndpoints(
	apiKey: string,
	modelId: string,
): Promise<ModelEndpoints> {
	const endpointPath = modelId.split("/").map(encodeURIComponent).join("/");
	const res = await fetch(`${BASE_URL}/models/${endpointPath}/endpoints`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
	});
	if (!res.ok) {
		throw new Error(
			`OpenRouter /models/${modelId}/endpoints failed: ${res.status} ${res.statusText}`,
		);
	}
	const json = (await res.json()) as { data?: { id?: unknown; endpoints?: unknown[] } };
	return narrowModelEndpoints(modelId, json.data);
}

// ---------------------------------------------------------------------------
// Field-narrowing (pure — factored out for unit-testable shape validation)
// ---------------------------------------------------------------------------

/** Narrow a raw models list to the typed shape. */
export function narrowModels(raw: unknown[]): readonly OpenRouterModel[] {
	return raw
		.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
		.map((item) => ({
			id: String(item.id ?? ""),
			created: typeof item.created === "number" ? item.created : 0,
			pricing: narrowPricing(item.pricing),
			supported_parameters: narrowStringArray(item.supported_parameters),
			context_length: typeof item.context_length === "number" ? item.context_length : undefined,
		}));
}

/** Narrow raw endpoint API response to typed shape. */
export function narrowModelEndpoints(
	modelId: string,
	data: { id?: unknown; endpoints?: unknown[] } | undefined,
): ModelEndpoints {
	const endpoints = Array.isArray(data?.endpoints)
		? data.endpoints
				.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
				.map(narrowEndpoint)
		: [];
	return { id: modelId, endpoints };
}

function narrowEndpoint(raw: Record<string, unknown>): OpenRouterEndpoint {
	return {
		provider_name: String(raw.provider_name ?? ""),
		supported_parameters: narrowStringArray(raw.supported_parameters),
		pricing: narrowPricing(raw.pricing),
		uptime_last_30m: typeof raw.uptime_last_30m === "number" ? raw.uptime_last_30m : null,
		throughput_last_30m: narrowPercentileObj(raw.throughput_last_30m),
		latency_last_30m: narrowPercentileObj(raw.latency_last_30m),
		status: String(raw.status ?? ""),
	};
}

function narrowPricing(raw: unknown): { readonly prompt: string; readonly completion: string } {
	if (typeof raw === "object" && raw !== null) {
		const r = raw as Record<string, unknown>;
		return {
			prompt: String(r.prompt ?? "0"),
			completion: String(r.completion ?? "0"),
		};
	}
	return { prompt: "0", completion: "0" };
}

function narrowStringArray(raw: unknown): readonly string[] {
	if (Array.isArray(raw)) {
		return raw.filter((x): x is string => typeof x === "string");
	}
	return [];
}

function narrowPercentileObj(raw: unknown): { readonly p50: number } | null {
	if (typeof raw === "object" && raw !== null) {
		const r = raw as Record<string, unknown>;
		if (typeof r.p50 === "number") {
			return { p50: r.p50 };
		}
	}
	return null;
}
