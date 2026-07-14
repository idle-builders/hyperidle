/**
 * `observability` Service (core-api) — outbound composition-boundary
 * (Mechanism C) DI ports.
 *
 * Per architecture §10.2's census, `observability`'s one CENSUS-listed
 * outbound edge is `settings` (`config.ts`'s `readServerConfig`/
 * `updateServerConfig` calls, scoped to the `server_config.observability`
 * section) — an ORDINARY downward core-api→core-api edge (NOT §10.3
 * against-grain), same idiom as `git-export`'s `GitExportServerConfigPort`
 * / `notifications`' `NotificationsServerConfigPort` (Increments 2c/1g).
 *
 * §10.2 also lists an INBOUND edge, `session-lifecycle → observability`
 * (`session-provisioning.ts`'s `summarizeToolArgs` call) — that edge is the
 * CALLER's concern, not this package's: `session-provisioning.ts` still
 * lives in the unguarded `packages/server` composition root (agent-
 * orchestration has not migrated yet), so it repoints straight to
 * `@hyperidle/observability`'s real export with zero DI-port ceremony on
 * this side. It becomes a genuine forward-reference only once
 * `session-lifecycle` migrates in Increment 3 — same pattern as the
 * settings/notifications credential forward-refs closed in Increment 1h.
 *
 * Structural port, same idiom as every prior Service's `ports.ts`: mirrors
 * the real target function's signature so the concrete caller can pass its
 * existing function references unchanged — zero behavior change. Types are
 * declared locally (structural mirrors of `@hyperidle/settings`' own
 * `ServerConfig.observability` section) rather than imported from the
 * target package — a Service NEVER imports another Service, even for a
 * type-only reference.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { ObservabilityChannel } from "./types.js";

/** Structural mirror of `@hyperidle/settings`' `ServerConfig.observability` section. */
export interface ObservabilityConfigSection {
	enabled: boolean;
	adapter: ObservabilityChannel;
	batchSize: number;
	flushIntervalMs: number;
	bufferCap: number;
}

export interface ObservabilityConfigSectionPatch {
	enabled?: boolean;
	adapter?: ObservabilityChannel;
	batchSize?: number;
	flushIntervalMs?: number;
	bufferCap?: number;
}

/** Port for `settings`' read/write surface `config.ts` calls directly today. */
export interface ObservabilityServerConfigPort {
	read(db: HyperIdleDb): Promise<{ observability: ObservabilityConfigSection }>;
	update(
		db: HyperIdleDb,
		patch: { observability: ObservabilityConfigSectionPatch },
	): Promise<unknown>;
}

export interface ObservabilityConfigDeps {
	readonly serverConfig: ObservabilityServerConfigPort;
}
