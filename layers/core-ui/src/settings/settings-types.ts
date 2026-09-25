/**
 * Shared settings types.
 *
 * @lore P4 Decision 1: Types live in layers/core-ui/src/settings/settings-types.ts
 * (not in a framework package, because these are web-only).
 *
 * @lore P4 fix: All types migrated here from SettingsPanel.tsx so hooks and
 * section components can import from a stable location independent of the
 * SettingsPanel component lifecycle.
 */

/**
 * A team-registered filesystem as the per-bot injection control sees it.
 * The bot's config selects WHICH registered filesystems to inject; the registry
 * itself lives in Settings → Filesystems. `source` is the easy-to-detect mark.
 */
export interface InjectableFilesystem {
	id: string;
	source: string; // 'local' | 'github' | 'gdrive' | 'obsidian' | …
	/** repo "owner/name" or folder path — the resource selection. */
	resource: string;
	kind: string; // 'code' | 'doc_set' | …
}

/** X3: Agent configuration as returned by GET /api/agents. */
export interface AgentConfig {
	id: string;
	name: string;
	role: string;
	/**
	 * The human this agent belongs to, or null for a team-owned agent.
	 * Every user's agent is an ordinary agent that the user owns —
	 * `GET /api/agents` carries this directly; optional here because most
	 * existing test fixtures for this type predate the field.
	 */
	ownerUserId?: string | null;
	/** The agent's identity document, or null when it has none. */
	identityDocumentId: string | null;
	harnessType: string | null;
	/** Per-agent model ID. null = use tier fallback. */
	modelId: string | null;
	/** Per-agent model provider. null = use tier fallback ("anthropic"). */
	modelProvider: string | null;
	maxConcurrentSessions: number;
	status: string;
	/**
	 * @lore AU26 J4: `activeSessions` was REMOVED. Core-api served it by counting
	 * rows in `agent-orchestration`'s `sessions` table, and both PATCH handlers
	 * had to re-serve it purely so the client could splice the response back into
	 * the list row. Settings → Agents now fetches
	 * `GET /api/agent-orchestration/runs/active-counts` alongside this list and
	 * keeps the counts in their own state — same rendered string, and a save no
	 * longer carries a run count at all.
	 */
	/** AB3: "team" | "individual" | null. Matches users.agentCategory. @lore AD8a: "personal"→"individual". @lore BA9d: "strategy" removed. */
	agentCategory: string | null;
	/**
	 * Registered-filesystem ids injected into THIS bot (the per-bot injection
	 * mapping). Drawn from the team registry; defaults to [] when absent.
	 */
	filesystemIds?: string[];
	/**
	 * The harness options this agent's model runs with. Sparse — only the values
	 * moved away from the harness's own default. Absent for an agent that has
	 * none, which is most of them.
	 */
	modelOptions?: Readonly<Record<string, string | number | boolean>>;
}
