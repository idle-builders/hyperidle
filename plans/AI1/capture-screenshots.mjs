/**
 * AI1 Phase 4 fix — capture visual proof screenshots.
 *
 * Captures:
 *  1. TaskSheet open (desktop + mobile) — Sessions/Task/Discussion dividers via --border-subtle
 *  2. KnowledgeBody heading typography — h1/h2/h3 via [data-knowledge-body] rules in index.css
 *  3. SettingsAssistant save-error + save-success feedback states
 *
 * Run: node plans/AI1/capture-screenshots.mjs
 * Requires: dev server running on port 5175
 */

import { chromium } from "playwright";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
const BASE_URL = "http://localhost:5173";

// Core API mocks needed for every page load (mirrors e2e/fixtures.ts)
const DEFAULT_AUTH_ME = {
  id: "test-founder",
  name: "Test Founder",
  email: "test@hyperidle.dev",
  role: "founder",
  avatarUrl: null,
};

const DEFAULT_SETTINGS = {
  profile: { name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null },
  teams: [],
  users: [],
  notifications: {
    reviewAlerts: true,
    costAlerts: true,
    blockerAlerts: true,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    mutedTeams: [],
  },
};

async function withCoreMocks(page) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DEFAULT_AUTH_ME) })
  );
  await page.route("**/api/settings", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DEFAULT_SETTINGS) })
  );
  await page.route("**/api/threads**", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ threads: [] }) });
    } else {
      route.continue();
    }
  });
  await page.route("**/api/teams**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ teams: [] }) })
  );
  await page.route("**/api/hints**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ dismissed: [] }) })
  );
  await page.route("**/api/knowledge/triage-count**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0 }) })
  );
}

async function waitForDesignSystem(page, fragmentTitle) {
  // Navigate to /designsystem with a hash fragment
  const encoded = encodeURIComponent(fragmentTitle);
  await page.goto(`${BASE_URL}/designsystem#${encoded}`, { waitUntil: "networkidle" });
  // Wait for the component title to appear
  await page.waitForSelector(`h2:has-text("${fragmentTitle}")`, { timeout: 15000 });
  // Let any lazy-loaded components settle
  await page.waitForTimeout(800);
}

async function captureTaskSheet(browser) {
  console.log("Capturing TaskSheet...");

  // 1a. Desktop (1280x800)
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktopPage = await desktopCtx.newPage();
  await desktopPage.goto(`${BASE_URL}/designsystem#TaskSheet::OpenNoIntent`, { waitUntil: "networkidle" });
  // Wait for the TaskSheet dialog to appear
  await desktopPage.waitForSelector('[data-testid="task-sheet"]', { timeout: 15000 });
  await desktopPage.waitForTimeout(500);
  // Screenshot the full page to show the sheet with dividers
  await desktopPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "02-tasksheet-desktop.png"), fullPage: false });
  console.log("  Desktop done.");
  await desktopCtx.close();

  // 1b. Mobile (390x844)
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto(`${BASE_URL}/designsystem#TaskSheet::OpenNoIntent`, { waitUntil: "networkidle" });
  await mobilePage.waitForSelector('[data-testid="task-sheet"]', { timeout: 15000 });
  await mobilePage.waitForTimeout(500);
  await mobilePage.screenshot({ path: path.join(SCREENSHOTS_DIR, "03-tasksheet-mobile.png"), fullPage: false });
  console.log("  Mobile done.");
  await mobileCtx.close();
}

async function captureKnowledgeBody(browser) {
  console.log("Capturing KnowledgeBody headings...");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Mock all required APIs for the KnowledgeDetail page
  await withCoreMocks(page);

  const KNOWLEDGE_BODY = [
    "# Authentication Strategy",
    "",
    "A concise summary of our auth approach.",
    "",
    "## JWT-based Auth",
    "",
    "Access tokens expire in 15 minutes. Refresh tokens last 7 days.",
    "",
    "### Edge cases",
    "",
    "Mobile apps use device-bound refresh tokens.",
    "",
    "## Session Management",
    "",
    "Sessions are tracked in Redis with a 24-hour sliding window.",
    "",
    "#### Implementation notes",
    "",
    "See the runbook in /docs/runbooks/auth.md for details.",
  ].join("\n");

  const MOCK_ITEM = {
    id: "k1",
    title: "Architecture Decision: Auth Strategy",
    body: KNOWLEDGE_BODY,
    format: "markdown",
    status: "active",
    version: 1,
    updatedBy: "Test Founder",
    scopeKind: "company",
    scopeId: null,
    topic: "Auth",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    kind: "decision",
    layer: "L0",
  };

  // Use a non-fixture ID so API data takes priority over fixture fallback
  const KID = "kAI1-heading-proof";
  MOCK_ITEM.id = KID;

  await page.route("**/api/knowledge/" + KID + "**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_ITEM) })
  );
  await page.route("**/api/threads**", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ threads: [] }) });
    } else {
      route.continue();
    }
  });
  await page.route("**/api/agents**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );
  await page.route("**/api/hints**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ dismissed: [] }) })
  );

  await page.goto(`${BASE_URL}/knowledge/${KID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Wait for knowledge body to render
  await page.waitForSelector('[data-knowledge-body]', { timeout: 10000 });
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "04-knowledge-body-headings.png"), fullPage: false });
  console.log("  Knowledge body headings done.");
  await ctx.close();
}

async function withSettingsMocks(page, assistantPatchHandler) {
  await withCoreMocks(page);

  // Mock all APIs that settings sections call
  await page.route("**/api/users/*/assistant", assistantPatchHandler);
  // SettingsAgents expects a raw array (AgentConfig[]), not { agents: [] }
  await page.route("**/api/agents**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );
  await page.route("**/api/org**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ edges: [], users: [], teams: [] }) })
  );
  // SettingsModels uses /api/model-gateway not /api/models
  await page.route("**/api/model-gateway**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      reasoning: { modelId: "claude-opus-4-5", hasApiKey: false },
      workhorse: { modelId: "claude-sonnet-4-5", hasApiKey: false },
      fast: { modelId: "claude-haiku-3-5", hasApiKey: false },
    }) })
  );
  await page.route("**/api/users/*", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        id: "test-founder",
        name: "Test Founder",
        email: "test@hyperidle.dev",
        avatarUrl: null,
      })});
    } else {
      route.continue();
    }
  });
  await page.route("**/api/worker**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "idle" }) })
  );
}

async function captureSettingsAssistant(browser) {
  console.log("Capturing SettingsAssistant feedback states...");

  const ASSISTANT_DATA = {
    id: "agent-asst-1",
    name: "Assistant",
    soulPrompt: "Be helpful and precise.",
  };

  // --- Save-error state ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    await withSettingsMocks(page, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ASSISTANT_DATA) });
      } else if (route.request().method() === "PATCH") {
        route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal server error" }) });
      } else {
        route.continue();
      }
    });

    // Navigate to conversations with settings=open
    await page.goto(`${BASE_URL}/conversations?settings=open`, { waitUntil: "networkidle" });

    // Debug: take a screenshot to see what we got
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "_debug-settings.png") });
    const currentUrl = page.url();
    const bodySnippet = await page.locator('body').innerHTML().catch(() => 'n/a');
    console.log(`  Settings nav URL: ${currentUrl}`);
    console.log(`  Body snippet (first 500): ${bodySnippet.slice(0, 500)}`);

    await page.waitForSelector('[data-testid="settings-page"]', { timeout: 15000 });
    await page.waitForTimeout(600);

    // Scroll to the assistant section
    const assistantSection = page.locator('[data-testid="settings-section-assistant"]');
    await assistantSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    // Wait for the textarea to be populated (not loading state)
    await page.waitForFunction(() => {
      const ta = document.querySelector('#soul-prompt');
      return ta && !ta.disabled;
    }, { timeout: 8000 });

    // Make the textarea dirty by changing content
    const textarea = page.locator("#soul-prompt");
    await textarea.fill("Modified soul prompt text to trigger dirty state");
    await page.waitForTimeout(200);

    // Click Save — triggers the PATCH which returns 500
    const saveButton = page.locator('button[aria-label="Save"]');
    await saveButton.click();

    // Wait for error message to appear
    await page.waitForSelector('[role="alert"]', { timeout: 8000 });
    await page.waitForTimeout(300);

    // Scroll to make sure the error is visible
    await assistantSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05-settings-assistant-error.png"), fullPage: false });
    console.log("  Save-error state done.");
    await ctx.close();
  }

  // --- Save-success state ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    await withSettingsMocks(page, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ASSISTANT_DATA) });
      } else if (route.request().method() === "PATCH") {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...ASSISTANT_DATA, soulPrompt: "Updated." }) });
      } else {
        route.continue();
      }
    });

    await page.goto(`${BASE_URL}/conversations?settings=open`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="settings-page"]', { timeout: 15000 });
    await page.waitForTimeout(600);

    const assistantSection = page.locator('[data-testid="settings-section-assistant"]');
    await assistantSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    await page.waitForFunction(() => {
      const ta = document.querySelector('#soul-prompt');
      return ta && !ta.disabled;
    }, { timeout: 8000 });

    const textarea = page.locator("#soul-prompt");
    await textarea.fill("Updated soul prompt.");
    await page.waitForTimeout(200);

    const saveButton = page.locator('button[aria-label="Save"]');
    await saveButton.click();

    // Wait for "Saved" success message
    await page.waitForFunction(() => {
      // Look for the success p element (color: var(--status-success))
      const ps = document.querySelectorAll('p');
      return Array.from(ps).some(p => p.textContent?.trim() === 'Saved');
    }, { timeout: 8000 });
    await page.waitForTimeout(300);

    await assistantSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05-settings-assistant-success.png"), fullPage: false });
    console.log("  Save-success state done.");
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await captureTaskSheet(browser);
    await captureKnowledgeBody(browser);
    await captureSettingsAssistant(browser);
    console.log("All screenshots captured.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
