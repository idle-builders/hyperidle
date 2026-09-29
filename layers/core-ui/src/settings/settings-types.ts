export interface InjectableFilesystem {
	id: string;
	source: string; // 'local' | 'github' | 'gdrive' | 'obsidian' | …
	/** repo "owner/name" or folder path — the resource selection. */
	resource: string;
	kind: string; // 'code' | 'doc_set' | …
}

export interface AgentConfig {
	id: string;
	name: string;
	/** The agent's craft — designer, developer, whatever it was given. null when unset. */
	discipline: string | null;
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
	/** "team" | "individual" | null. Matches users.agentCategory. */
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
