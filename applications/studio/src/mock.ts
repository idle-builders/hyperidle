/**
 * Mock world. Written from the founder interview, not from the shipped app.
 * No API, no fixtures import, no domain types — this is design material.
 */
export interface QueueItem {
	id: string;
	origin: "BET" | "TASK" | "DOC" | "REVIEW";
	title: string;
	sub: string;
	age: string;
	waiting?: boolean;
}

export const needsYou: QueueItem[] = [
	{
		id: "naming",
		origin: "TASK",
		title: "What do we call this on the pricing page?",
		sub: "Builder is asking · goes in front of every trial user",
		age: "6h",
		waiting: true,
	},
	{
		id: "trial-copy",
		origin: "REVIEW",
		title: "Trial-end explainer — ready for your eyes",
		sub: "Designer · rendered preview attached",
		age: "8h",
		waiting: true,
	},
	{
		id: "infra-ask",
		origin: "DOC",
		title: "Infra wants the rollout rule written down",
		sub: "Maya · crosses your ownership",
		age: "11h",
		waiting: true,
	},
];

export const overnight: QueueItem[] = [
	{ id: "o1", origin: "TASK", title: "Metering wired into the new tiers", sub: "Builder · session finished 02:14", age: "7h" },
	{ id: "o2", origin: "DOC", title: "Support themes for July, three recurring", sub: "Ops · published", age: "7h" },
	{ id: "o3", origin: "TASK", title: "Proration math covered end to end", sub: "Builder · session finished 03:40", age: "5h" },
	{ id: "o4", origin: "BET", title: "Trial extension flow — hypothesis held", sub: "Growth · 27% lift, verdict ready", age: "5h" },
	{ id: "o5", origin: "DOC", title: "Deploy rule, redrafted from Tuesday's retro", sub: "Facilitation · draft", age: "4h" },
	{ id: "o6", origin: "TASK", title: "Comparison table stacks at every width", sub: "Designer · session finished 05:02", age: "4h" },
	{ id: "o7", origin: "TASK", title: "Trial entitlement dates normalised to UTC", sub: "Builder · session finished 05:55", age: "3h" },
];
