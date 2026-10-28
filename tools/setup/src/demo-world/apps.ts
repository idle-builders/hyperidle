/**
 * Three apps: Builder's price check in the trial-end conversation, Growth's trial length calculator
 * on the task that pulled the numbers, and the founder's plan picker in the pricing tree. An app is
 * a document whose format is html.
 */

import { documents, type HyperIdleDb } from "@hyperidle/db";
import {
	BUILDER_ID,
	DOC_HOW_WE_PRICE,
	FOUNDER_ID,
	GROWTH_ID,
	PRODUCT_TEAM_ID,
	SUPPORT_TEAM_ID,
	TASK_NUMBERS,
	THREAD_TRIAL_END,
} from "./ids.js";
import type { DemoClock } from "./time.js";

const PRICE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Trial-end price</title>
<meta name="description" content="What someone pays on the day their trial ends">
<style>
body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; color: #1d1b16; }
h1 { font-size: 20px; margin: 0 0 4px; }
p { margin: 0 0 16px; color: #5c574c; }
.plans { display: flex; gap: 8px; margin-bottom: 20px; }
button { font: inherit; padding: 8px 14px; border: 1.5px solid #1d1b16; border-radius: 8px; background: #fff; cursor: pointer; }
button[aria-pressed="true"] { background: #f5d547; }
.pay { font-size: 26px; font-weight: 700; }
</style>
</head>
<body>
<h1>What you pay when the trial ends</h1>
<p>Pick a plan. The trial is 14 days; the card is charged the morning after.</p>
<div class="plans">
<button type="button" data-price="12">Starter</button>
<button type="button" data-price="29">Team</button>
<button type="button" data-price="79">Business</button>
</div>
<div class="pay" id="pay">Pick a plan to see the price</div>
<script>
for (const b of document.querySelectorAll("button")) {
	b.addEventListener("click", () => {
		for (const o of document.querySelectorAll("button")) o.setAttribute("aria-pressed", String(o === b));
		document.getElementById("pay").textContent = "On day 15 you pay £" + b.dataset.price;
	});
}
</script>
</body>
</html>`;

const LENGTH_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Trial length calculator</title>
<meta name="description" content="How many trials turn into paid plans at each trial length">
<style>
body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; color: #1d1b16; }
h1 { font-size: 20px; margin: 0 0 4px; }
p { margin: 0 0 16px; color: #5c574c; }
input { width: 100%; }
.out { font-size: 26px; font-weight: 700; margin-top: 12px; }
</style>
</head>
<body>
<h1>Trial length</h1>
<p>Last quarter: 412 trials at 14 days, 128 paid (31%). Each day shorter loses about 1.5 points.</p>
<label for="days">Days: <span id="n">14</span></label>
<input id="days" type="range" min="7" max="21" step="1" value="14">
<div class="out" id="out"></div>
<script>
const days = document.getElementById("days");
const show = () => {
	const d = Number(days.value);
	const rate = Math.max(0, 31 - (14 - d) * 1.5);
	document.getElementById("n").textContent = d;
	document.getElementById("out").textContent = "About " + Math.round(412 * rate / 100) + " of 412 people pay";
};
days.addEventListener("input", show);
show();
</script>
</body>
</html>`;

const PLANS_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Which plan fits</title>
<meta name="description" content="Answer two questions and see which plan someone should be on">
<style>
body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; color: #1d1b16; }
h1 { font-size: 20px; margin: 0 0 16px; }
label { display: block; margin: 0 0 12px; }
select { font: inherit; margin-left: 8px; }
.out { font-size: 22px; font-weight: 700; margin-top: 16px; }
</style>
</head>
<body>
<h1>Which plan fits</h1>
<label>People on the team <select id="seats"><option value="1">1</option><option value="5">2–5</option><option value="20">6–20</option><option value="50">More than 20</option></select></label>
<label>Needs single sign-on <select id="sso"><option value="no">No</option><option value="yes">Yes</option></select></label>
<div class="out" id="out"></div>
<script>
const seats = document.getElementById("seats");
const sso = document.getElementById("sso");
const show = () => {
	const n = Number(seats.value);
	const plan = sso.value === "yes" || n > 20 ? "Business, £79" : n > 1 ? "Team, £29" : "Starter, £12";
	document.getElementById("out").textContent = "Plan: " + plan + " a month";
};
seats.addEventListener("change", show);
sso.addEventListener("change", show);
show();
</script>
</body>
</html>`;

export async function seedApps(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	const apps = [
		{
			id: "demo-doc-app-trial-end-price",
			title: "Trial-end price",
			body: PRICE_PAGE,
			team: SUPPORT_TEAM_ID,
			parentKind: "thread" as const,
			parentId: THREAD_TRIAL_END,
			by: BUILDER_ID,
			at: clock.at(1, "12:45"),
		},
		{
			id: "demo-doc-app-trial-length",
			title: "Trial length calculator",
			body: LENGTH_PAGE,
			team: PRODUCT_TEAM_ID,
			parentKind: "task" as const,
			parentId: TASK_NUMBERS,
			by: GROWTH_ID,
			at: clock.at(10, "10:50"),
		},
		{
			id: "demo-doc-app-which-plan",
			title: "Which plan fits",
			body: PLANS_PAGE,
			team: PRODUCT_TEAM_ID,
			parentKind: "document" as const,
			parentId: DOC_HOW_WE_PRICE,
			by: FOUNDER_ID,
			at: clock.daysAgo(6),
		},
	];
	for (const app of apps)
		await db
			.insert(documents)
			.values({
				id: app.id,
				scopeKind: "team",
				scopeId: app.team,
				title: app.title,
				body: app.body,
				format: "html",
				status: "active",
				slot: "ordinary",
				parentKind: app.parentKind,
				parentId: app.parentId,
				updatedBy: app.by,
				createdAt: app.at,
				updatedAt: app.at,
			})
			.onConflictDoNothing();
}
