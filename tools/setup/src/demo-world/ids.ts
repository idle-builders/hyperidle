/**
 * AX1 — stable ids for the demo world, in one place.
 *
 * Every row the demo world inserts carries a `demo-*` id (or the existing
 * skeleton's ids / factory `seed-*` agents). Fixed ids + `onConflictDoNothing`
 * = idempotent reseeding, and demo data stays distinguishable from anything
 * a real instance produces.
 */

// ── Cast ────────────────────────────────────────────────────────────────────
export const TEAM_ID = "demo-team-acme";
export const FOUNDER_ID = "demo-founder";
export const MAYA_ID = "demo-human-maya";
export const ASSISTANT_ID = "ast-demo-founder";
export const BUILDER_ID = "demo-agent-builder";
export const PM_ID = "demo-agent-pm";
export const DESIGNER_ID = "demo-agent-designer";
export const QA_ID = "demo-agent-qa";
export const GROWTH_ID = "demo-agent-growth";
/**
 * @lore BA9d: seed-agent-pf-facilitation removed from factory bootstrap.
 * Knowledge-management plugin will provide facilitators. Demo world uses
 * the demo founder's assistant as stand-in for knowledge-routine activity.
 */
export const FACILITATOR_ID = "ast-demo-founder";
export const PROPAGATION_ID = "system:propagation";

// ── Root tasks (formerly bets) ───────────────────────────────────────────────
// @lore BB1: bets table dropped. Root tasks (parentTaskId: null) replace bets
// as the top-level work container. IDs intentionally keep "demo-task-" prefix
// so they are distinct from their child tasks.
export const ROOT_TASK_PRICING = "demo-task-pricing";
export const ROOT_TASK_ONBOARDING = "demo-task-onboarding";
export const ROOT_TASK_CHURN = "demo-task-churn";
export const ROOT_TASK_DOWNGRADE = "demo-task-downgrade";
export const ROOT_TASK_TRIAL = "demo-task-trial";
export const ROOT_TASK_SEARCH = "demo-task-search";
export const ROOT_TASK_MOBILE = "demo-task-mobile";
/** Daily digest root task (from factory skeleton). ID kept for FK compat with demo-fixture.ts. */
export const ROOT_TASK_DIGEST = "demo-bet-daily-digest";

// ── Tasks ───────────────────────────────────────────────────────────────────
export const TASK_PRICING_RESEARCH = "demo-task-pricing-research";
export const TASK_PRICING_TIERS = "demo-task-pricing-tiers";
export const TASK_PRICING_PAGE = "demo-task-pricing-page";
// Grandchildren of TASK_PRICING_PAGE — creates the 3-level-deep branch:
//   ROOT_TASK_PRICING → TASK_PRICING_PAGE → TASK_PRICING_PAGE_{DESKTOP,MOBILE}
// @lore BB1: 3-level nesting proof (root → child → grandchild).
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

// ── Artifacts ───────────────────────────────────────────────────────────────
export const ART_PRICING_PAGE = "demo-art-pricing-page";
export const ART_PRICING_COPY = "demo-art-pricing-copy";
export const ART_PRICING_HERO = "demo-art-pricing-hero";
export const ART_TRIAL_FLOW = "demo-art-trial-flow";
export const ART_TRIAL_METRICS = "demo-art-trial-metrics";
export const ART_SEARCH_RANKING = "demo-art-search-ranking";
export const ART_SEARCH_EVAL = "demo-art-search-eval";
export const ART_ONBOARD_AUDIT = "demo-art-onboard-audit";
export const ART_MOBILE_RESEARCH = "demo-art-mobile-research";

// ── Threads ─────────────────────────────────────────────────────────────────
export const THREAD_ASSISTANT = "demo-thread-assistant";
export const THREAD_PRICING_REVIEW = "demo-thread-pricing-review";
export const THREAD_PRICING_BLOCKED = "demo-thread-pricing-blocked";
export const THREAD_TRIAL_REVIEW = "demo-thread-trial-review";
export const THREAD_SEARCH_REVIEW = "demo-thread-search-review";
export const THREAD_DM_PM_FOUNDER = "demo-thread-dm-pm-founder";
export const THREAD_DM_FOUNDER_BUILDER = "demo-thread-dm-founder-builder";
export const THREAD_DM_MAYA_GROWTH = "demo-thread-dm-maya-growth";
export const THREAD_BET_PRICING = "demo-thread-bet-pricing";
export const THREAD_BET_TRIAL_RETRO = "demo-thread-bet-trial-retro";
export const THREAD_BET_MOBILE_KILL = "demo-thread-bet-mobile-kill";
export const THREAD_TEAM_FEED = "demo-thread-team-feed";
export const THREAD_KI_CHURN = "demo-thread-ki-churn";
export const THREAD_ART_TRIAL_METRICS = "demo-thread-art-trial-metrics";
export const THREAD_TASK_ONBOARD = "demo-thread-task-onboard";

// ── Messages (only the ones other rows reference) ───────────────────────────
export const MSG_PRICING_REVIEW = "demo-msg-pricing-review-request";
export const MSG_PRICING_QUESTIONNAIRE = "demo-msg-pricing-annual-questionnaire";
export const MSG_TRIAL_REVIEW = "demo-msg-trial-review-request";
export const MSG_SEARCH_REVIEW = "demo-msg-search-review-request";

// ── Knowledge ───────────────────────────────────────────────────────────────
export const KI_CHURN_SIGNALS = "demo-ki-churn-early-signals";
export const KI_PRICING_TIERS = "demo-ki-two-tier-pricing";
export const KI_TRIAL_RETRO = "demo-ki-retro-trial-extension";
export const KI_MOBILE_POSTMORTEM = "demo-ki-postmortem-mobile";

// ── Routines ────────────────────────────────────────────────────────────────
// @lore BA9d: ritual routine ids (post-task retro, knowledge decay, knowledge
// promotion) removed from the demo world — the plugin owns them now. Only the
// skeleton's daily digest remains here; all other routines come from plugins.
export const ROUTINE_DAILY_DIGEST = "demo-routine-daily_digest";

// ── Sessions (only the ones other rows reference) ───────────────────────────
export const SESSION_ACTIVE_COPY = "demo-session-pricing-copy-live";
export const SESSION_ACTIVE_ASSISTANT = "demo-session-assistant-live";
