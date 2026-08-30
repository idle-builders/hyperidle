/**
 * Settings section IDs, constants, and shared settings types.
 *
 * @lore P4 Decision 1: Types live in layers/core-ui/src/settings/settings-types.ts
 * (not in a framework package, because these are web-only). This is a separate file from
 * SettingsPanel.tsx so the overlay pattern can import section ids without
 * importing the old modal component.
 *
 * @lore P4 fix: All types migrated here from SettingsPanel.tsx so hooks and
 * section components can import from a stable location independent of the
 * SettingsPanel component lifecycle.
 */

// --- Section navigation ---

/**
 * AV2: Removed "worker" (folded under backend) and "models" (folded into builtin harness detail).
 * "assistant" was never in this union (handled in SettingsAssistant, now deleted — the assistant
 * is a row in the Agents section).
 */
export type SettingsSectionId =
	| "profile"
	| "orgchart"
	| "credentials"
	| "notifications"
	| "appearance"
	| "agents"
	| "agent-behavior"
	| "filesystems"
	| "backend";

export interface SettingsSection {
	id: SettingsSectionId;
	label: string;
}

/**
 * @lore AF15: SETTINGS_SECTIONS is consumed by AppShell.tsx (settings sidebar nav).
 * AppShell.tsx filters this array into `visibleSettingsSections`, gating the "worker"
 * entry to shared-mode Electron only (worker section hidden in local/web mode).
 * Catalog updated for AF15: removed "teams" (no SettingsTeams component mounted);
 * added "agents" + "worker" (both mounted in SettingsPage).
 *
 * GOTCHA — binary-grep trap: plain `grep` / `git grep` (text mode) reports ZERO hits
 * for "SETTINGS_SECTIONS" in AppShell.tsx because that file contains a literal
 * control-character regex at line 88 and is classified as BINARY by git/grep.
 * `git grep` shows "Binary file AppShell.tsx matches" — that IS a hit.
 * Use `sed -n` or the Read tool to inspect real consumers; never trust a plain grep
 * "no references" verdict for any symbol in AppShell.tsx. This trap caused a
 * review false-negative (WARNING-1 in the AF15 architecture-critique).
 */
/**
 * AV2: "worker" removed (folded under Backend). "models" removed (folded into builtin harness
 * detail in SettingsHarnesses). The assistant is now part of the "agents" section.
 */
export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
	{ id: "profile", label: "Profile" },
	{ id: "orgchart", label: "Org chart" },
	{ id: "agents", label: "Agents" },
	{ id: "agent-behavior", label: "Agent behavior" },
	// AO1: Filesystems registry section — team-scoped file sources (code repos, doc sets).
	{ id: "filesystems", label: "Filesystems" },
	{ id: "appearance", label: "Appearance" },
	{ id: "credentials", label: "Credentials" },
	{ id: "notifications", label: "Notifications" },
	{ id: "backend", label: "Backend" },
];

/**
 * AO1: A team-registered filesystem as the per-bot injection control sees it.
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
	/** The agent's identity document, or null when it has none. */
	identityKnowledgeId: string | null;
	harnessType: string | null;
	modelTierPreference: string | null;
	/** AH2: Per-agent model ID. null = use tier fallback. */
	modelId: string | null;
	/** AH2: Per-agent model provider. null = use tier fallback ("anthropic"). */
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
	 * AO1: Registered-filesystem ids injected into THIS bot (the per-bot injection
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
