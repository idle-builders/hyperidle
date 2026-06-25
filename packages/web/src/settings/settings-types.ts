/**
 * Settings section IDs, constants, and shared settings types.
 *
 * @lore P4 Decision 1: Types live in packages/web/src/settings/settings-types.ts
 * (not in shared, because these are web-only). This is a separate file from
 * SettingsPanel.tsx so the overlay pattern can import section ids without
 * importing the old modal component.
 *
 * @lore P4 fix: All types migrated here from SettingsPanel.tsx so hooks and
 * section components can import from a stable location independent of the
 * SettingsPanel component lifecycle.
 */

// --- Section navigation ---

export type SettingsSectionId =
	| "profile"
	| "orgchart"
	| "credentials"
	| "notifications"
	| "appearance"
	| "models"
	| "agents"
	| "connections"
	| "surfaces" // AL5: review surfaces adopt/browse
	| "backend"
	| "worker"; // X3/AF15: worker and agent configuration sections

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
export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
	{ id: "profile", label: "Profile" },
	{ id: "orgchart", label: "Org chart" },
	{ id: "models", label: "Models" },
	{ id: "connections", label: "Connections" },
	{ id: "surfaces", label: "Review surfaces" },
	{ id: "agents", label: "Agents" },
	{ id: "appearance", label: "Appearance" },
	{ id: "credentials", label: "Credentials" },
	{ id: "notifications", label: "Notifications" },
	{ id: "backend", label: "Backend" },
	// "worker" filtered at runtime by AppShell.tsx visibleSettingsSections — shared-mode only.
	{ id: "worker", label: "Worker" },
];

/** X3: Agent configuration as returned by GET /api/agents. */
export interface AgentConfig {
	id: string;
	name: string;
	role: string;
	systemPrompt: string | null;
	harnessType: string | null;
	modelTierPreference: string | null;
	/** AH2: Per-agent model ID. null = use tier fallback. */
	modelId: string | null;
	/** AH2: Per-agent model provider. null = use tier fallback ("anthropic"). */
	modelProvider: string | null;
	maxConcurrentSessions: number;
	status: string;
	activeSessions: number;
	/** AB3: "team" | "strategy" | "individual" | null. Matches users.agentCategory. @lore AD8a: "personal" renamed to "individual". */
	agentCategory: string | null;
}
