/**
 * AX1 — stable ids for the demo world, in one place.
 *
 * Every row the demo world inserts itself carries a `demo-*` id; the team's
 * agents carry the ids the plugin installer gives them. Fixed ids +
 * `onConflictDoNothing` = idempotent reseeding.
 */

import { teamPluginAgentId } from "@hyperidle/core-api";

// ── Cast ────────────────────────────────────────────────────────────────────
// Two teams in the one organisation. The founder is in both, Maya in Support;
// each agent is in one — the plugin's agents in Product, Designer moved to Support.
export const PRODUCT_TEAM_ID = "demo-team-product";
export const SUPPORT_TEAM_ID = "demo-team-support";
export const FOUNDER_ID = "demo-founder";
export const MAYA_ID = "demo-human-maya";
export const ASSISTANT_ID = "ast-demo-founder";

// The team's agents are the bundled `role-personas` plugin's, installed for the
// Product team by `seedDemoWorld`; each id is the one the installer gives it.
export const ROLE_PERSONAS_PLUGIN = "role-personas";
const personaAgent = (agentId: string): string =>
	teamPluginAgentId(ROLE_PERSONAS_PLUGIN, agentId, PRODUCT_TEAM_ID);
export const BUILDER_ID = personaAgent("builder");
export const PM_ID = personaAgent("product-manager");
export const DESIGNER_ID = personaAgent("designer");
export const QA_ID = personaAgent("qa-engineer");
export const GROWTH_ID = personaAgent("growth");
export const OPS_ID = personaAgent("ops");
export const FACILITATOR_ID = personaAgent("facilitator");
export const PROPAGATION_ID = "system:propagation";

// ── Root tasks ──────────────────────────────────────────────────────────────
// @lore Root tasks (parentTaskId: null) are the top-level work container. IDs
// keep "demo-task-" prefix to distinguish them from their child tasks.
export const ROOT_TASK_PRICING = "demo-task-pricing";
export const ROOT_TASK_ONBOARDING = "demo-task-onboarding";
export const ROOT_TASK_CHURN = "demo-task-churn";
export const ROOT_TASK_DOWNGRADE = "demo-task-downgrade";
export const ROOT_TASK_TRIAL = "demo-task-trial";
export const ROOT_TASK_SEARCH = "demo-task-search";
export const ROOT_TASK_MOBILE = "demo-task-mobile";

// ── Tasks ───────────────────────────────────────────────────────────────────
export const TASK_PRICING_RESEARCH = "demo-task-pricing-research";
export const TASK_PRICING_TIERS = "demo-task-pricing-tiers";
export const TASK_PRICING_PAGE = "demo-task-pricing-page";
// Grandchildren of TASK_PRICING_PAGE — creates the 3-level-deep branch:
//   ROOT_TASK_PRICING → TASK_PRICING_PAGE → TASK_PRICING_PAGE_{DESKTOP,MOBILE}
export const TASK_PRICING_PAGE_DESKTOP = "demo-task-pricing-page-desktop";
export const TASK_PRICING_PAGE_MOBILE = "demo-task-pricing-page-mobile";
export const TASK_PRICING_COPY = "demo-task-pricing-copy";
export const TASK_PRICING_ANNUAL = "demo-task-pricing-annual";
export const TASK_PRICING_METERING = "demo-task-pricing-metering";
export const TASK_PRICING_METRICS = "demo-task-pricing-metrics";

export const TASK_ONBOARD_AUDIT = "demo-task-onboard-audit";
export const TASK_ONBOARD_SEQUENCE = "demo-task-onboard-sequence";
export const TASK_ONBOARD_TEMPLATES = "demo-task-onboard-templates";
export const TASK_ONBOARD_TRIGGER = "demo-task-onboard-trigger";

export const TASK_TRIAL_BANNER = "demo-task-trial-banner";
export const TASK_TRIAL_FLOW = "demo-task-trial-flow";
export const TASK_TRIAL_EMAIL = "demo-task-trial-email";
export const TASK_TRIAL_HEURISTIC = "demo-task-trial-heuristic";
export const TASK_TRIAL_MEASURE = "demo-task-trial-measure";

export const TASK_SEARCH_PROFILE = "demo-task-search-profile";
export const TASK_SEARCH_RANKING = "demo-task-search-ranking";
export const TASK_SEARCH_EVAL = "demo-task-search-eval";
export const TASK_SEARCH_PERSONALIZE = "demo-task-search-personalize";

export const TASK_MOBILE_RESEARCH = "demo-task-mobile-research";
export const TASK_MOBILE_PROTO = "demo-task-mobile-proto";
export const TASK_MOBILE_SHELL = "demo-task-mobile-shell";

export const TASK_DOWNGRADE_POLICY = "demo-task-downgrade-policy";
export const TASK_DOWNGRADE_UI = "demo-task-downgrade-ui";
export const TASK_CHURN_SIGNALS = "demo-task-churn-signals";
export const TASK_CHURN_DASH = "demo-task-churn-dash";

// ── Produced documents ──────────────────────────────────────────────────────
// @lore Produced content is a document parented to the task that generated it.
export const DOC_PRICING_PAGE = "demo-doc-pricing-page";
export const DOC_TRIAL_FLOW = "demo-doc-trial-flow";
export const DOC_TRIAL_METRICS = "demo-doc-trial-metrics";
export const DOC_SEARCH_RANKING = "demo-doc-search-ranking";

// ── Threads ─────────────────────────────────────────────────────────────────
export const THREAD_ASSISTANT = "demo-thread-assistant";
export const THREAD_PRICING_REVIEW = "demo-thread-pricing-review";
export const THREAD_PRICING_BLOCKED = "demo-thread-pricing-blocked";
export const THREAD_TRIAL_REVIEW = "demo-thread-trial-review";
export const THREAD_SEARCH_REVIEW = "demo-thread-search-review";
export const THREAD_DM_PM_FOUNDER = "demo-thread-dm-pm-founder";
export const THREAD_DM_FOUNDER_BUILDER = "demo-thread-dm-founder-builder";
export const THREAD_DM_MAYA_GROWTH = "demo-thread-dm-maya-growth";
export const THREAD_TASK_PRICING = "demo-thread-task-pricing";
export const THREAD_TASK_TRIAL_RETRO = "demo-thread-task-trial-retro";
export const THREAD_TASK_MOBILE_KILL = "demo-thread-task-mobile-kill";
export const THREAD_TEAM_FEED = "demo-thread-team-feed";
export const THREAD_DOC_CHURN = "demo-thread-doc-churn";
export const THREAD_DOC_TRIAL_METRICS = "demo-thread-doc-trial-metrics";
export const THREAD_TASK_ONBOARD = "demo-thread-task-onboard";

// ── Messages (only the ones other rows reference) ───────────────────────────
export const MSG_PRICING_REVIEW = "demo-msg-pricing-review-request";
export const MSG_PRICING_QUESTIONNAIRE = "demo-msg-pricing-annual-questionnaire";
export const MSG_TRIAL_REVIEW = "demo-msg-trial-review-request";
export const MSG_SEARCH_REVIEW = "demo-msg-search-review-request";

// ── Documents ─────────────────────────────────────────────────────────────
export const DOC_CHURN_SIGNALS = "demo-doc-churn-early-signals";
export const DOC_PRICING_TIERS = "demo-doc-two-tier-pricing";
export const DOC_TRIAL_RETRO = "demo-doc-retro-trial-extension";
export const DOC_MOBILE_POSTMORTEM = "demo-doc-postmortem-mobile";

// @lore Ritual subscriptions (post-task retro, knowledge decay, knowledge promotion) are
// owned by the plugin, not seeded here — installing the plugin produces exactly one of each.

// ── Sessions (only the ones other rows reference) ───────────────────────────
export const SESSION_ACTIVE_COPY = "demo-session-pricing-copy-live";
export const SESSION_ACTIVE_ASSISTANT = "demo-session-assistant-live";
