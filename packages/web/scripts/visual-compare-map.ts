/**
 * Mapping from reference HTML mockups to live app routes.
 *
 * Each entry maps a reference directory name to:
 * - route: the live app URL path to navigate to
 * - setup: optional async function to prepare the page state (open modals, click tabs, etc.)
 * - description: human-readable description of what this reference shows
 *
 * @lore Some references show the same route but different states. The setup function
 * handles state preparation (e.g., opening settings panel, selecting a filter).
 * References ending in _nimmly are product-specific variants — they map to the same
 * routes but with different data contexts.
 */

import type { Page } from "@playwright/test";

export interface ReferenceEntry {
	name: string;
	route: string;
	description: string;
	setup?: (page: Page) => Promise<void>;
}

export const REFERENCE_MAP: ReferenceEntry[] = [
	// --- App Shell ---
	{
		name: "app_shell_systems_nominal",
		route: "/conversations/review",
		description: "Default app shell in nominal state — conversations view active",
	},
	{
		name: "app_shell_attention_required",
		route: "/conversations/review",
		description: "App shell with attention-required indicators (blockers, unread)",
	},

	// --- Conversations ---
	{
		name: "conversations_all_threads",
		route: "/conversations/review",
		description: "Conversation list showing all threads",
	},
	{
		name: "conversations_blocking_filter",
		route: "/conversations/review",
		description: "Conversation list filtered to blocking items",
	},
	{
		name: "conversations_chief_of_staff_chat",
		route: "/conversations/chat",
		description: "Chief of Staff chat interface",
	},
	{
		name: "conversations_pcb_companion_pane_review",
		route: "/conversations/review",
		description: "Conversation review with companion pane open",
	},
	{
		name: "review_thread_active_discussion",
		route: "/conversations/review",
		description: "Review thread in active discussion state",
	},
	{
		name: "review_thread_crm_email_sequence",
		route: "/conversations/review",
		description: "Review thread showing CRM email sequence content",
	},
	{
		name: "review_thread_fresh_proposal",
		route: "/conversations/review",
		description: "Review thread showing a fresh proposal",
	},
	{
		name: "review_thread_high_stakes_operations",
		route: "/conversations/review",
		description: "Review thread in high-stakes operations context",
	},
	{
		name: "acoustic_test_metrics_review",
		route: "/conversations/review",
		description: "Review thread showing acoustic test metrics artifact",
	},

	// --- Work ---
	{
		name: "portfolio_overview",
		route: "/work/portfolio",
		description: "Work portfolio overview with bet cards",
	},
	{
		name: "bet_detail_pricing_overhaul",
		route: "/work/bet/bet-1",
		description: "Bet detail view — pricing overhaul bet",
	},
	{
		name: "team_view_nimmly",
		route: "/work/team",
		description: "Team kanban view",
	},
	{
		name: "new_pitch_form_nimmly",
		route: "/work/portfolio",
		description: "New pitch form overlay",
	},
	{
		name: "pitch_selector_overlay_nimmly",
		route: "/work/portfolio",
		description: "Pitch selector overlay",
	},

	// --- Knowledge ---
	{
		name: "knowledge_curated_view",
		route: "/knowledge",
		description: "Knowledge list in curated view mode",
	},
	{
		name: "knowledge_triage_view",
		route: "/knowledge",
		description: "Knowledge list in triage view mode",
	},
	{
		name: "knowledge_item_detail_edit",
		route: "/knowledge/ki-1",
		description: "Knowledge item detail in edit mode",
	},
	{
		name: "knowledge_merge_items_modal",
		route: "/knowledge",
		description: "Knowledge merge items modal open",
	},

	// --- Settings ---
	{
		name: "settings_budgets",
		route: "/conversations/review?settings=open",
		description: "Settings panel — budgets section",
		setup: async (page: Page) => {
			// Wait for settings panel to open
			await page
				.waitForSelector("[data-testid='settings-panel']", { timeout: 5000 })
				.catch(() => {});
			await page.waitForTimeout(300);
		},
	},
	{
		name: "settings_notifications",
		route: "/conversations/review?settings=open",
		description: "Settings panel — notifications section",
		setup: async (page: Page) => {
			await page
				.waitForSelector("[data-testid='settings-panel']", { timeout: 5000 })
				.catch(() => {});
			await page.waitForTimeout(300);
		},
	},
];
