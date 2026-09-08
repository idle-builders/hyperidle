/**
 * @lore nested-knowledge-items: `layer` (L0-L4), `kind`, `KNOWLEDGE_SCOPES`
 * (practice/product/factory) are DELETED — a knowledge item's place in the
 * tree (parentId/parentKind/position) says what it is about; `scope` says
 * only who sees it. See plan.md "The two jobs, separated".
 * `KNOWLEDGE_TOPIC_HEALTHS`/`KnowledgeTopicHealth` are DELETED with `topic` —
 * their only caller was `fixtures/knowledge-data.ts`'s topic-cohort math,
 * itself dead once `topic` no longer exists.
 *
 * The status ladder collapses from two 7/4-value vocabularies to one:
 * proposed | active | stale | archived. `proposed` replaces
 * draft/captured/provisional; `active` replaces validated/active; `archived`
 * replaces archived/needs_human.
 */
export const KNOWLEDGE_STATUSES = ["proposed", "active", "stale", "archived"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const KNOWLEDGE_STATUS_LABEL: Record<KnowledgeStatus, string> = {
	proposed: "Proposed",
	active: "Active",
	stale: "Stale",
	archived: "Archived",
};

export type KnowledgeAccessorKind = "human" | "agent";

export const KNOWLEDGE_SORT_OPTIONS = ["relevance", "recency", "frequency"] as const;
export type KnowledgeSortOption = (typeof KNOWLEDGE_SORT_OPTIONS)[number];

export type PropagationLevel = "session" | "task" | "team" | "portfolio";

/**
 * @lore BA9b: Role of a knowledge item — determines how context assembly
 * materialises it into the session sandbox. Widened by the knowledge-
 * attachment-slot item: role now means *where the item lands in the
 * session*, which is broader than "sandbox file or not" — `prompt` lands as
 * the run's instruction, never a file.
 *
 * - ordinary: knowledge/... files (default, backward-compatible)
 * - skill: a SKILL.md in the harness's skills directory
 * - rule: knowledge/rules/ — always present, plain text for the agent
 * - agent_file: the "## Identity" section of AGENTS.md, bound via `parentId`
 * - prompt: the run's instruction — never materialised as a sandbox file
 */
export const KNOWLEDGE_ROLES = ["ordinary", "skill", "rule", "agent_file", "prompt"] as const;
export type KnowledgeRole = (typeof KNOWLEDGE_ROLES)[number];

/**
 * @lore knowledge-attachment-slot: which table `parentId` points into. Mirrors
 * the DB CHECK `ki_parent_kind_ck` — the same relationship `KNOWLEDGE_ROLES`
 * has to `ki_role_ck`. Phase 1 writes only `routine` and `agent`; the other
 * three ship now so phase 2 and the nested-knowledge strand never reopen the
 * constraint.
 *
 * @lore nested-knowledge-items: `knowledge_item` is now a real, live parent
 * kind — a knowledge item's parent may be another knowledge item, forming the
 * tree. Walks stop at the first non-`knowledge_item` parent (plan.md "The
 * tree").
 */
export const KNOWLEDGE_PARENT_KINDS = [
	"knowledge_item",
	"task",
	"thread",
	"routine",
	"agent",
] as const;
export type KnowledgeParentKind = (typeof KNOWLEDGE_PARENT_KINDS)[number];

/**
 * Reader-facing label for each role — the total map keeps
 * `npm run check` honest against `KNOWLEDGE_ROLES`: adding a role without a
 * label fails the build rather than shipping a blank badge.
 *
 * Lives in domain-model, not core-ui: its consumer is the skills-and-rules
 * list (settings), and this is document-role vocabulary — not to be confused
 * with the agent-role `roleLabel` in `./agent-roles.ts`, a different axis
 * entirely (what an agent DOES, not what a knowledge item IS).
 */
export const KNOWLEDGE_ROLE_LABEL: Record<KnowledgeRole, string> = {
	ordinary: "Knowledge",
	skill: "Skill",
	rule: "Rule",
	agent_file: "Identity",
	prompt: "Prompt",
};
