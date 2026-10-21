export const devices = [
	{ id: "desktop", name: "Desktop", w: 1280 },
	{ id: "tablet", name: "Tablet", w: 834 },
	{ id: "phone", name: "Phone", w: 390 },
];

export const diff = [
	{ n: 214, sign: " ", text: "  const cycleStart = plan.currentPeriodStart;" },
	{ n: 215, sign: "-", text: "  const days = differenceInDays(now, cycleStart);" },
	{
		n: 216,
		sign: "+",
		text: "  const days = differenceInCalendarDays(utc(now), utc(cycleStart));",
	},
	{ n: 217, sign: " ", text: "  const unused = days / plan.cycleLength;" },
	{ n: 218, sign: "-", text: "  return Math.round(plan.amount * unused);" },
	{ n: 219, sign: "+", text: "  // half-up at the boundary, matches the invoice engine" },
	{ n: 220, sign: "+", text: "  return roundHalfUp(plan.amount * unused);" },
];

export const numbers = [
	{ label: "Trial-end tickets", value: "31", delta: "−58%", good: true },
	{ label: "Reached support", value: "12", delta: "−64%", good: true },
	{ label: "Trial → paid", value: "24.1%", delta: "+1.8pt", good: true },
	{ label: "Refund requests", value: "4", delta: "+1", good: false },
];
