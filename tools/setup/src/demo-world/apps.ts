/**
 * The demo's apps. Three are documents whose format is html: Builder's price check in the
 * trial-end conversation, Growth's trial length calculator on the task that pulled the numbers,
 * and the founder's plan picker in the pricing tree. `OPTIONS_PAGE` is a whole message that is an
 * app, in the Q4 pricing conversation; `PICKER_SKETCH` is the plan picker task's description.
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

/** Growth's two pricing page options, sent as a message. */
export const OPTIONS_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Pricing page, two options</title>
<meta name="description" content="Option A and option B side by side: trial length, reminder, and what each costs us">
<style>
body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; color: #1d1b16; }
h1 { font-size: 20px; margin: 0 0 12px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
button { font: inherit; padding: 8px 14px; border: 1.5px solid #1d1b16; border-radius: 8px; background: #fff; cursor: pointer; }
button[aria-pressed="true"] { background: #f5d547; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
dt { color: #5c574c; }
dd { margin: 0; font-weight: 600; }
</style>
</head>
<body>
<h1>Pricing page, two options</h1>
<div class="tabs">
<button type="button" data-o="a" aria-pressed="true">Option A</button>
<button type="button" data-o="b">Option B</button>
</div>
<dl id="out"></dl>
<script>
const options = {
	a: [["Trial", "14 days"], ["Reminder", "None"], ["Paid after trial", "31%"], ["Pages to change", "1"]],
	b: [["Trial", "10 days"], ["Reminder", "Day 7 email"], ["Paid after trial", "About 26%"], ["Pages to change", "2"]],
};
const show = (key) => {
	for (const b of document.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.o === key));
	document.getElementById("out").innerHTML = options[key].map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("");
};
for (const b of document.querySelectorAll("button")) b.addEventListener("click", () => show(b.dataset.o));
show("a");
</script>
</body>
</html>`;

/** The plan picker task's description: a sketch of the picker it is building. */
export const PICKER_SKETCH = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Plan picker sketch</title>
<meta name="description" content="Three plans side by side, the trial's plan picked to start with">
<style>
body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; color: #1d1b16; }
h1 { font-size: 20px; margin: 0 0 4px; }
p { margin: 0 0 16px; color: #5c574c; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
label { display: block; padding: 14px; border: 1.5px solid #1d1b16; border-radius: 10px; cursor: pointer; }
label:has(input:checked) { background: #f5d547; }
input { margin: 0 6px 0 0; }
.price { display: block; font-size: 22px; font-weight: 700; margin-top: 6px; }
#picked { margin-top: 16px; font-weight: 600; }
</style>
</head>
<body>
<h1>Plan picker</h1>
<p>What this part builds: the plans side by side, the one from the trial picked to start with.</p>
<div class="plans">
<label><input type="radio" name="plan" value="Starter">Starter<span class="price">£12</span></label>
<label><input type="radio" name="plan" value="Team" checked>Team<span class="price">£29</span></label>
<label><input type="radio" name="plan" value="Business">Business<span class="price">£79</span></label>
</div>
<div id="picked"></div>
<script>
const say = () => {
	const plan = document.querySelector("input:checked").value;
	document.getElementById("picked").textContent = "Picked: " + plan;
};
for (const input of document.querySelectorAll("input")) input.addEventListener("change", say);
say();
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
			// After the hand-written documents, so it sits last under How we price.
			position: 100,
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
				position: "position" in app ? app.position : 0,
				updatedBy: app.by,
				createdAt: app.at,
				updatedAt: app.at,
			})
			.onConflictDoNothing();
}
