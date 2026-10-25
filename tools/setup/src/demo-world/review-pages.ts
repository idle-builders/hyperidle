/**
 * The pages the demo world's reviews show as live previews. Each is a whole page in a
 * `data:text/html` address, so it renders with no server and no network.
 */

const STYLE = `
* { box-sizing: border-box; margin: 0; }
body { font: 15px/1.5 -apple-system, "Segoe UI", sans-serif; color: #24231f; background: #fbfaf7; padding: 32px; }
main { max-width: 720px; margin: 0 auto; }
.eyebrow { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #7a776e; }
h1 { font-size: 26px; line-height: 1.2; margin-top: 8px; }
.sub { font-size: 17px; color: #4a4842; margin-top: 12px; max-width: 48ch; }
.bill { display: flex; flex-wrap: wrap; gap: 32px; margin-top: 24px; padding: 16px; border: 1px solid #dedad0; border-radius: 8px; background: #fff; }
.bill b { display: block; font-size: 22px; }
.bill span span { font-size: 12px; color: #7a776e; }
.note { color: #7a776e; margin-top: 16px; }
`;

const page = (title: string, style: string, body: string): string =>
	`data:text/html;charset=utf-8,${encodeURIComponent(
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${style}</style></head><body><main>${body}</main></body></html>`,
	)}`;

/** The trial-end page Builder made: the date and the amount before the trial runs out. */
export const TRIAL_END_PAGE = page(
	"Your trial",
	STYLE,
	`<span class="eyebrow">Your trial</span>
<h1>Your first bill: 2 September</h1>
<p class="sub">Your trial ends on 1 September. The day after, we start your Team plan and send the first invoice.</p>
<div class="bill">
<span id="amount"><b>£24</b><span>per month</span></span>
<span id="first-charge"><b>2 Sep</b><span>first charge</span></span>
<span id="warning"><b>3 days</b><span>we warn you before</span></span>
</div>
<p class="note">Cancel any time before 1 September and you will not be charged.</p>`,
);

/** The plans side by side; on a narrow screen they stack, price first. */
export const COMPARISON_TABLE = page(
	"Plans",
	`${STYLE}
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
.plan { border: 1px solid #dedad0; border-radius: 8px; background: #fff; padding: 16px; }
.plan h2 { font-size: 17px; }
.price { font-size: 22px; font-weight: 700; margin-top: 4px; }
.plan ul { padding-left: 18px; margin-top: 8px; color: #4a4842; }
@media (max-width: 600px) { .plans { grid-template-columns: 1fr; } }`,
	`<span class="eyebrow">Plans</span>
<h1>Pick the plan that fits</h1>
<div class="plans">
<section class="plan" id="starter"><p class="price">£0</p><h2>Starter</h2><ul><li>One person</li><li>Three projects</li></ul></section>
<section class="plan" id="team"><p class="price">£24</p><h2>Team</h2><ul><li>Up to ten people</li><li>Every project</li></ul></section>
<section class="plan" id="business"><p class="price">£60</p><h2>Business</h2><ul><li>Any number of people</li><li>Single sign-on</li></ul></section>
</div>`,
);
