/**
 * `model-gateway` Service (core-api) — outbound composition-boundary
 * (Mechanism C) DI port for its one real outbound edge per architecture
 * §10.2's census: `model-gateway → connections` (`resolveProvider` →
 * `CredentialResolver.resolve`, line 368).
 *
 * `ModelGatewayCredentialResolver` is a structural mirror of
 * `@hyperidle/connections`'s own `CredentialResolver` interface — a Service
 * NEVER imports another Service's type, even a type-only reference (same
 * rule `@hyperidle/policy`'s `ports.ts` documents and `@hyperidle/review`'s
 * `ports.ts` established first). Every real production caller already
 * constructs a concrete `DbCredentialResolver`/`EnvCredentialResolver`
 * (both from `@hyperidle/connections`, migrated Increment 1h) which
 * structurally satisfies this port unchanged — zero behavior change, since
 * both interfaces share the identical `resolve(name: CredentialName):
 * Promise<string | null>` shape.
 *
 * @lore AU19 Increment 2e: this Service was ALREADY passing its one
 * dependency (`connections`' `CredentialResolver`) as a plain function
 * parameter pre-migration (X4/AH1's original design) — so the edge was
 * already DI-shaped. The only structural gap this increment closes is the
 * type identity: the parameter type was a direct `import type … from
 * "@hyperidle/connections"` (a real cross-Service type import), now replaced
 * with this package's own locally-declared mirror.
 */

import type { CredentialName } from "@hyperidle/shared";

/** Port for `connections`' credential lookup (`model-gateway → connections`, §10.2 line 368). */
export interface ModelGatewayCredentialResolver {
	resolve(name: CredentialName): Promise<string | null>;
}
