import { chromium } from "playwright";

const shots = [
  { title: "Page: Review/A — Verdict Brief", out: "verdict-brief/screenshot.png" },
  { title: "Page: Review/B — Examination Bench", out: "examination-bench/screenshot.png" },
  { title: "Page: Review/C — Reasoning Ledger", out: "reasoning-ledger/screenshot.png" },
];
const base = "http://localhost:8098/#";
const dir = new URL(".", import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/unique .key. prop/.test(m.text())) errors.push("console: " + m.text()); });

for (const s of shots) {
  errors.length = 0;
  await page.goto(base + encodeURIComponent(s.title), { waitUntil: "networkidle" });
  // Isolate the "Populated" section to full viewport so sticky-bottom bars anchor correctly.
  const ok = await page.evaluate(() => {
    const tb = document.querySelector(".toolbar"); if (tb) tb.style.display = "none";
    for (const el of document.querySelectorAll("*")) {
      const st = el.getAttribute && el.getAttribute("style");
      if (st && st.includes("max-width: 1024px")) {
        el.style.maxWidth = "none"; el.style.margin = "0"; el.style.padding = "0";
      }
    }
    const grid = document.querySelector(".demo-grid");
    if (grid) { grid.style.display = "block"; grid.style.gap = "0"; }
    let kept = false;
    for (const sec of document.querySelectorAll(".demo-section")) {
      const t = sec.querySelector(".demo-section-title");
      if (t && t.textContent.trim() === "Populated") {
        t.style.display = "none"; sec.style.margin = "0"; sec.style.padding = "0"; kept = true;
      } else {
        sec.style.display = "none";
      }
    }
    window.scrollTo(0, 0);
    return kept;
  });
  await page.waitForTimeout(900);
  try {
    await page.screenshot({ path: dir + s.out });
    console.log(`OK  ${s.title}  isolated=${ok}  errors=${errors.length}`);
  } catch (e) {
    console.log(`FAIL ${s.title}  ${String(e).slice(0,140)}`);
  }
  if (errors.length) console.log("   ⚠ " + errors.slice(0, 3).join(" | ").slice(0, 300));
}
await browser.close();
