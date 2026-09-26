export type PluginState = "enabled" | "disabled" | "removed";

/**
 * The kinds of thing a plugin can contribute, and the table each points into:
 * `agent` → `users`, `subscription` → `subscriptions`, `document` →
 * `documents` (skills, agent identities and subscription prompts alike).
 */
export const PLUGIN_CONTRIBUTION_KINDS = ["agent", "subscription", "document"] as const;
export type PluginContributionKind = (typeof PLUGIN_CONTRIBUTION_KINDS)[number];

export type PluginScopeKind = "factory" | "team";
