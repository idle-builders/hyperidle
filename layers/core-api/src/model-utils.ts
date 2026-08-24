/**
 * Model-catalog helpers local to core-api.
 *
 * @lore AU44-b8: isCatalogModel and catalogEntry moved from
 * framework/domain-model/src/model-gateway.ts. Both functions are used
 * exclusively within core-api (agents route + validate-agent-config route).
 * They remain in domain-model/src/model-gateway.ts for that file's own unit
 * tests, but are no longer re-exported from the domain-model barrel.
 */
import { MODEL_CATALOG } from "@hyperidle/domain-model";

/** Returns true if `id` is a valid catalog model ID. */
export function isCatalogModel(id: string): boolean {
	return MODEL_CATALOG.some((m) => m.id === id);
}

/** Returns the catalog entry for `id`, or undefined if not found. */
export function catalogEntry(id: string): (typeof MODEL_CATALOG)[number] | undefined {
	return MODEL_CATALOG.find((m) => m.id === id);
}
