/**
 * `org` Service (core-api) — outbound composition-boundary (Mechanism C) DI
 * ports, per architecture §10.2's census: `org`'s real outbound edge target is
 * `users` (two call sites — `scaffold-agents.ts` → `getUserById`/`insertUser`).
 *
 * @lore AU44 B1: `OrgAgentRunConfigWriter` folded into `OrgUserDirectory` — the
 * two were always wired together into the same `deps` object; a one-method port
 * does not earn its own type. `listUsersByKind` removed — recipient resolution
 * moved into `@hyperidle/users` as `listHumans`; reading users is native there.
 *
 * @lore AU19 Increment 1d: `users` migrated for real. This port is now wired
 * at every real call site to `@hyperidle/users`' real exported functions.
 *
 * @lore AU26 G1 (architecture §D-L): `writeAgentRunConfig` added. `persistScaffoldedAgents`
 * is the single writer of agent user rows, and it stamps the Kernel-owned mechanism
 * fields (`harnessType`/`modelId`/`modelProvider`/`maxConcurrentSessions`). Those
 * fields left `users` for `agent_run_config`, so the writer now makes two writes.
 * It cannot import `@hyperidle/run-orchestration` directly —
 * `composition-boundary-guard` forbids a Service package depending on another Service
 * — so the Layer wires this port, exactly as it already wires `orgUsers`.
 */

import type { NewUser, User, WriteExecutor } from "@hyperidle/db";

/**
 * Port for `users`' read/write + run-config-write surface `org` calls directly.
 *
 * @lore AU44 B1: merged `OrgAgentRunConfigWriter` members in — always wired together.
 */
export interface OrgUserDirectory {
	getUserById(db: WriteExecutor, id: string): Promise<User | undefined>;
	insertUser(db: WriteExecutor, values: NewUser, opts?: { ifAbsent?: boolean }): Promise<void>;
	writeAgentRunConfig(
		db: WriteExecutor,
		agentUserId: string,
		patch: {
			readonly harnessType?: string | null;
			readonly modelTierPreference?: string | null;
			readonly modelId?: string | null;
			readonly modelProvider?: string | null;
			readonly maxConcurrentSessions?: number;
		},
	): Promise<void>;
	/**
	 * Give a newly created agent its identity document. The identity is an
	 * `agent_file` knowledge document bound to the agent, not a run-config field
	 * — run config is what harness to use, identity is who the agent is.
	 */
	upsertAgentIdentity(
		db: WriteExecutor,
		input: {
			readonly agentId: string;
			readonly agentName: string;
			readonly body: string;
			readonly updatedBy: string;
		},
	): Promise<string>;
}
