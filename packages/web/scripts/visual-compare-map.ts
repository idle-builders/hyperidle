/**
 * Mapping from Claude Design reference prototypes to live app routes.
 *
 * References live in docs/design-synthesis/ — interactive React apps
 * served via HTTP. Each entry specifies:
 * - referenceUrl: path on the reference server (default :8099)
 * - referenceSetup: actions to reach the right tab/state in the reference
 * - route: the live app URL path to compare against
 * - implSetup: actions to reach the right state in the implementation
 *
 * @lore The design references are React apps (CDN React + Babel) that need
 * HTTP serving — file:// won't work due to cross-origin script loading.
 * A python3 -m http.server on the design-synthesis dir handles this.
 */

import type { Page } from "@playwright/test";

export interface ReferenceEntry {
	name: string;
	referenceUrl: string;
	referenceSetup?: (page: Page) => Promise<void>;
	route: string;
	implSetup?: (page: Page) => Promise<void>;
	description: string;
}

/** Wait for React+Babel to finish rendering */
async function waitForReactRender(page: Page): Promise<void> {
	await page.waitForTimeout(3000);
	await page.waitForFunction(
		() => {
			const root = document.getElementById("root");
			return root && root.children.length > 0;
		},
		null,
		{ timeout: 10_000 },
	);
	await page.waitForTimeout(500);
}

export const REFERENCE_MAP: ReferenceEntry[] = [
	// ─── HyperIdle.html: Shell + Views ───
	{
		name: "shell_conversations",
		referenceUrl: "/HyperIdle.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
		},
		route: "/conversations/review",
		description: "App shell — conversations view (default landing)",
	},
	{
		name: "shell_work",
		referenceUrl: "/HyperIdle.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click('button[title="Work"]');
			await page.waitForTimeout(500);
		},
		route: "/work/portfolio",
		description: "App shell — work/portfolio view",
	},
	{
		name: "shell_knowledge",
		referenceUrl: "/HyperIdle.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click('button[title="Knowledge"]');
			await page.waitForTimeout(500);
		},
		route: "/knowledge",
		description: "App shell — knowledge view",
	},
	{
		name: "shell_settings",
		referenceUrl: "/HyperIdle.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click('button[title="Settings"]');
			await page.waitForTimeout(500);
		},
		route: "/conversations/review?settings=open",
		implSetup: async (page) => {
			await page
				.waitForSelector("[data-testid='settings-panel']", { timeout: 5000 })
				.catch(() => {});
			await page.waitForTimeout(300);
		},
		description: "App shell — settings view",
	},
	{
		name: "shell_components",
		referenceUrl: "/HyperIdle.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=02 · Components");
			await page.waitForTimeout(500);
		},
		route: "/designsystem",
		description: "Component catalog — reference vs design system page",
	},

	// ─── Conversations.html: Artifact deliverables ───
	{
		name: "conv_full_view",
		referenceUrl: "/Conversations.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
		},
		route: "/conversations/review",
		description: "Conversations — full review view with data_metrics artifact",
	},
	{
		name: "conv_text_diff",
		referenceUrl: "/Conversations.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=02 · TEXT_DIFF");
			await page.waitForTimeout(500);
		},
		route: "/conversations/review",
		description: "Conversations — text_diff artifact view",
	},
	{
		name: "conv_content_preview",
		referenceUrl: "/Conversations.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=03 · CONTENT_PREVIEW");
			await page.waitForTimeout(500);
		},
		route: "/conversations/review",
		description: "Conversations — content_preview artifact view",
	},
	{
		name: "conv_data_metrics",
		referenceUrl: "/Conversations.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=05 · DATA_METRICS");
			await page.waitForTimeout(500);
		},
		route: "/conversations/review",
		description: "Conversations — data_metrics artifact view",
	},
	{
		name: "conv_action_summary",
		referenceUrl: "/Conversations.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=04 · ACTION_SUMMARY");
			await page.waitForTimeout(500);
		},
		route: "/conversations/review",
		description: "Conversations — action_summary artifact view",
	},
	{
		name: "conv_visual_compare",
		referenceUrl: "/Conversations.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=06 · VISUAL_COMPARE");
			await page.waitForTimeout(500);
		},
		route: "/conversations/review",
		description: "Conversations — visual_comparison artifact view",
	},
	{
		name: "conv_chat",
		referenceUrl: "/Conversations.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=07 · CHAT");
			await page.waitForTimeout(500);
		},
		route: "/conversations/chat",
		description: "Conversations — Chief of Staff chat view",
	},
	{
		name: "conv_empty",
		referenceUrl: "/Conversations.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=08 · EMPTY");
			await page.waitForTimeout(500);
		},
		route: "/conversations/review",
		description: "Conversations — empty state",
	},

	// ─── Knowledge.html: Knowledge deliverables ───
	{
		name: "knowledge_curated",
		referenceUrl: "/Knowledge.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
		},
		route: "/knowledge",
		description: "Knowledge — curated list view",
	},
	{
		name: "knowledge_triage",
		referenceUrl: "/Knowledge.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=02 · Triage view");
			await page.waitForTimeout(500);
		},
		route: "/knowledge",
		description: "Knowledge — triage view",
	},
	{
		name: "knowledge_detail",
		referenceUrl: "/Knowledge.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=03 · Knowledge detail");
			await page.waitForTimeout(500);
		},
		route: "/knowledge/ki-1",
		description: "Knowledge — item detail view",
	},
	{
		name: "knowledge_edit",
		referenceUrl: "/Knowledge.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=04 · Edit mode");
			await page.waitForTimeout(500);
		},
		route: "/knowledge/ki-1",
		description: "Knowledge — edit mode",
	},
	{
		name: "knowledge_merge",
		referenceUrl: "/Knowledge.html",
		referenceSetup: async (page) => {
			await waitForReactRender(page);
			await page.click("text=05 · Merge modal");
			await page.waitForTimeout(500);
		},
		route: "/knowledge",
		description: "Knowledge — merge modal",
	},
];
