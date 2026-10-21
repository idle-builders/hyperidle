/** HAND OFF — the loop, written from the interview. */
export const STEPS = [
	{ id: 0, name: "Interruption arrives" },
	{ id: 1, name: "The twenty seconds" },
	{ id: 2, name: "Joined & committed" },
	{ id: 3, name: "Session running" },
	{ id: 4, name: "Needs your judgement" },
	{ id: 5, name: "Result returns" },
	{ id: 6, name: "Done" },
];

/** Agents and people are the same kind of addressable thing. */
export const mentionables = [
	{
		id: "builder",
		initials: "BU",
		name: "Builder",
		what: "Your agent · builds and ships",
		load: "idle",
	},
	{
		id: "designer",
		initials: "DS",
		name: "Designer",
		what: "Maya's agent · pages and copy",
		load: "2 running",
	},
	{ id: "maya", initials: "MC", name: "Maya Chen", what: "Person · support and ops", load: "away" },
	{
		id: "growth",
		initials: "GR",
		name: "Growth",
		what: "Your agent · trials and pricing",
		load: "idle",
	},
];

export const sessionSteps = [
	"read 14 support tickets tagged trial-end",
	"traced entitlement dates through billing",
	"found proration bug on mid-cycle upgrade",
	"wrote fix + 3 cases",
	"drafted the explainer copy",
];

/** The three tickets live in an external system. They come in as references. */
export const tickets = [
	{
		id: "ZD-4471",
		src: "ZD",
		title: "Charged after trial — was not expecting this",
		who: "priya@northwind.co",
	},
	{ id: "ZD-4468", src: "ZD", title: "What do I pay when the trial ends?", who: "sam@lumen.dev" },
	{ id: "ZD-4460", src: "ZD", title: "Trial ended, invoice confusing", who: "ops@fairbank.io" },
];

/** The agent goes past the fix and stages the follow-through for whoever owns it. */
export const drafts = [
	{
		ref: "ZD-4471",
		to: "priya@northwind.co",
		body: "You were charged on 2 September, the day your trial ended. We have rewritten that page so the date and amount now show before the trial runs out — and here is the breakdown for your account.",
	},
	{
		ref: "ZD-4468",
		to: "sam@lumen.dev",
		body: "Your first bill is £24 on 12 September for the Team plan. You will get an email three days before. The pricing page now says this on the plan you are trialling.",
	},
	{
		ref: "ZD-4460",
		to: "ops@fairbank.io",
		body: "That invoice covered the first month starting the day the trial ended. We found a proration bug on mid-cycle upgrades that made it read oddly — fixed, and your invoice has been reissued.",
	},
];
