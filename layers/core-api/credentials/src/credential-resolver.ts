import type { CredentialName } from "@hyperidle/domain-model";

/**
 * Fetches a stored secret on the caller's behalf.
 *
 * @lore AU19 Increment 4: reclassified from `layers/core-api/connections/src/
 * credential-resolver.ts` — an execution Service may accept an injected
 * `CredentialResolver` (never mutating `process.env` directly, P3 Decision 4),
 * but Mechanism B forbids it depending on `@hyperidle/connections` (a core-api
 * domain Service) even for a type-only reference.
 *
 * @lore AU34: it is a PORT — the two ends are different packages: one
 * implements it, another receives it.
 *
 * @lore It used to live in `resolve-model.ts`, "with the resolution that cannot
 * produce a ResolvedModel without it". That resolution is gone with the model
 * gateway; the port outlives it, because the shared-backend key is still a
 * stored secret somebody has to fetch.
 */
export interface CredentialResolver {
	resolve(name: CredentialName): Promise<string | null>;
}
