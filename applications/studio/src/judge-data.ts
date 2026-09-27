/**
 * One review, many result parts. The agent composes whatever proves the work —
 * a preview, a diff, an image, numbers, an email, a copy change — and each part
 * is pointed at in its own way.
 */
export type PartKind = "preview" | "code" | "image" | "numbers" | "email" | "text";

export interface Part {
	readonly id: string;
	readonly kind: PartKind;
	readonly label: string;
	readonly title: string;
	/** How you point at something inside this part. */
	readonly pointing: string;
	readonly comments: number;
}

export const parts: readonly Part[] = [
	{ id: "p1", kind: "preview", label: "Live preview", title: "Trial-end page", pointing: "Pick an element", comments: 2 },
	{ id: "p2", kind: "code", label: "Code", title: "Proration fix · 3 files", pointing: "Pick a line", comments: 1 },
	{ id: "p3", kind: "image", label: "Design", title: "Bill box, option B", pointing: "Drag a region", comments: 0 },
	{ id: "p4", kind: "numbers", label: "Numbers", title: "Trial-end tickets, 30 days", pointing: "Pick a figure", comments: 0 },
	{ id: "p5", kind: "email", label: "Email", title: "Three-day warning", pointing: "Select text", comments: 1 },
	{ id: "p6", kind: "text", label: "Copy", title: "Receipt line", pointing: "Select text", comments: 0 },
];

export const devices = [
	{ id: "desktop", name: "Desktop", w: 1280 },
	{ id: "tablet", name: "Tablet", w: 834 },
	{ id: "phone", name: "Phone", w: 390 },
];

export const diff = [
	{ n: 214, sign: " ", text: "  const cycleStart = plan.currentPeriodStart;" },
	{ n: 215, sign: "-", text: "  const days = differenceInDays(now, cycleStart);" },
	{ n: 216, sign: "+", text: "  const days = differenceInCalendarDays(utc(now), utc(cycleStart));" },
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
