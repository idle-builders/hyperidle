import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = "http://localhost:5173";
const out = new URL("./states-real/", import.meta.url);
await mkdir(out, { recursive: true });

const captures = [
  ["work-empty", "Page: Work/Overview", "Empty", 1024, 800, "light"],
  ["work-loading", "Page: Work/Overview", "Loading", 1024, 800, "light"],
  ["work-error", "Page: Work/Overview", "ErrorStateStory", 1024, 800, "light"],
  ["work-populated", "Page: Work/Overview", "Populated", 1440, 900, "light"],
  ["work-detail", "AU20 Real/WorkBet", "RichDescription", 1440, 1000, "light"],
  ["conversations-populated", "AU20 Real/Conversation Populated", "Populated", 1440, 1000, "dark"],
  ["knowledge-populated", "AU20 Real/KnowledgeList", "Populated", 1024, 900, "light"],
  ["knowledge-loading", "AU20 Real/KnowledgeList", "Loading", 1024, 800, "light"],
  ["knowledge-error", "AU20 Real/KnowledgeList", "Error", 1024, 800, "light"],
  ["settings", "AU20 Real/Settings", "Stacked", 768, 1000, "light"],
  ["assistant-empty", "AU20 Real/Assistant", "EmptyState", 768, 900, "dark", "[aria-label='Assistant conversation']"],
  ["assistant-context", "AU20 Real/Assistant", "ContextState", 768, 900, "dark", "[aria-label='Assistant conversation']"],
  ["scope-dialog", "Page: Knowledge/ScopeChangeDialog", "Default", 375, 760, "light", "[data-dialog-box]"],
  ["agent-profile", "Page: Agents/AgentProfile", "Healthy", 1024, 900, "light"],
  ["agent-add", "Page: Work/AgentAddDialog", "Open", 768, 900, "light", "[data-dialog-box]"],
  ["status", "StatusChip", "AllStatusVariants", 1024, 700, "light"],
  ["time", "CommentRow", "Plain", 1024, 700, "light"],
  ["search-results", "AU20 Real/Global Search Results", "Open", 1024, 800, "light", "[role='dialog'][aria-label='Global search']"],
  ["search-empty", "AU20 Real/Global Search Empty", "Open", 1024, 800, "light", "[role='dialog'][aria-label='Global search']"],
  ["not-found", "AU20 Real/NotFound", "Routed", 1024, 800, "light"],
  ["review-overview", "Review/Composition", "Overview", 1440, 1000, "light"],
  ["review-examining", "Review/Composition", "Examining", 1440, 1000, "light"],
  ["artifact-no-preview", "ArtifactPreview", "NoPreview", 1024, 700, "light"],
  ["block-actions", "BlockActionsPopover", "Default", 1024, 700, "light", "[role='menu'][aria-label='Block actions']"],
  ["setup", "Page: Setup/SetupFlow", "Default", 1440, 1000, "light"],
  ["desktop-titlebar", "DesktopTitleBar", "ElectronContext", 1920, 500, "light"],
];

const browser = await chromium.launch();
const start = Number(process.env.AU20_CAPTURE_START ?? "0");
const end = Number(process.env.AU20_CAPTURE_END ?? String(captures.length));
for (const [name, story, variant, width, height, theme, override] of captures.slice(start, end)) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
  await page.goto(`${base}/#${encodeURIComponent(story)}`);
  await page.evaluate((mode) => document.documentElement.setAttribute("data-theme", `hearth-${mode}`), theme);
  await page.addStyleTag({ content: ".anno-rail{display:none!important}body.anno-active{padding-right:0!important}" });
  const storySection = page.locator(`section[data-variant="${variant}"]`).first();
  const target = override ? storySection.locator(override).first() : storySection;
  if (name === "search-results" || name === "search-empty") {
    const dialog = target;
    await dialog.waitFor({ state: "visible" });
    await dialog.getByPlaceholder("Search conversations, work, knowledge...").evaluate((input, value) => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setValue) throw new Error("native input value setter unavailable");
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, name === "search-results" ? "deploy" : "no-such-result");
    if (name === "search-results") {
      await dialog.getByText("Deploy review", { exact: true }).waitFor({ state: "visible" });
      if (await dialog.getByText("No matches", { exact: true }).count()) throw new Error("search-results rendered empty state");
    } else {
      await dialog.getByText("No matches", { exact: true }).waitFor({ state: "visible" });
      if (await dialog.getByText("Deploy review", { exact: true }).count()) throw new Error("search-empty rendered results");
    }
  }
  if (name === "block-actions") {
    const menu = target;
    await menu.waitFor({ state: "visible" });
    await menu.getByRole("menuitem", { name: /Copy permalink/ }).waitFor({ state: "visible" });
    await menu.getByRole("menuitem", { name: /View threads/ }).waitFor({ state: "visible" });
    if ((await menu.getByRole("menuitem").count()) !== 2) throw new Error("Block actions menu item contract changed");
  }
  await target.waitFor({ state: "visible" });
  const viewerErrors = await page.locator("[data-story-error]").allTextContents();
  if (viewerErrors.length > 0) throw new Error(`${story}/${variant}: ${viewerErrors.join(" | ")}`);
  await target.screenshot({ path: new URL(`${name}-${width}x${height}-${theme}.png`, out).pathname });
  console.log(`${name}: story=${story} variant=${variant} viewport=${width}x${height} theme=${theme}`);
  await page.close();
}
await browser.close();
