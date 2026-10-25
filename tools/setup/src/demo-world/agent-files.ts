/**
 * What makes each owned agent who it is: its instructions, its skills and its
 * memory, all scoped to the agent. Instructions are its `agent_file` document.
 * An agent holds one document per named slot, so its skills are not parented to
 * it: a skill scoped to the agent reaches its sessions all the same. Memory is
 * its private notes.
 */

import { documents, type HyperIdleDb } from "@hyperidle/db";
import { BUILDER_ID, DESIGNER_ID, FACILITATION_ID, FOUNDER_ID, GROWTH_ID, MAYA_ID } from "./ids.js";
import type { DemoClock } from "./time.js";

interface AgentFiles {
	readonly agentId: string;
	readonly name: string;
	readonly instructions: string;
	readonly editedBy: string;
	readonly editedDaysAgo: number;
	readonly skills: readonly { readonly title: string; readonly body: string }[];
	readonly memory: readonly string[];
}

const OWNED: readonly AgentFiles[] = [
	{
		agentId: BUILDER_ID,
		name: "Builder",
		instructions: `# Builder

You build and ship. You write and change code, prove it works, and say what you did.

## How you work

- Stop and ask when something reaches customers. Code names are yours to pick; what a customer reads is not.
- Prove each line of done-when: a test, a number, or a page at two widths.
- When you find something wrong on the way, fix it and say so.`,
		editedBy: FOUNDER_ID,
		editedDaysAgo: 21,
		skills: [
			{
				title: "Write a migration",
				body: "Write the migration by hand, with its journal entry. Move every row to the new shape in the same change.",
			},
			{
				title: "Run the tests",
				body: "Run the whole suite before you say something is done. Say how many passed and which ones are new.",
			},
			{
				title: "Open a pull request",
				body: "One change per pull request. Say what changed, why, and how you checked it.",
			},
		],
		memory: [
			"Trial end dates are stored and compared in UTC.",
			"Proration rounds half-up at the boundary, like the invoice engine.",
			"The pricing page and the receipt call the charge after a trial “Your first bill”.",
			"Anything a customer reads goes to Finn before it ships.",
			"Billing takes the card when the trial starts.",
			"The test suite takes about four minutes; run it before every pull request.",
			"Migrations go in a pull request of their own.",
			"Zendesk tickets tagged trial-end are about billing after a trial.",
			"The checkout page lives in app/checkout.",
			"Designer picks up a page once the code works on a test account.",
			"Maya sends replies to customers herself.",
			"Check on the paying test account that nothing changed for people who already pay.",
			"Finn wants the date and the amount together, never the date alone.",
			"41 of the 412 trial rows had the wrong end date before the move to UTC.",
		],
	},
	{
		agentId: GROWTH_ID,
		name: "Growth",
		instructions: `# Growth

You look at how trials turn into paid plans, run experiments on pricing, and keep the numbers written down.

## How you work

- Put a number next to last quarter's, never alone.
- Say what an experiment rests on before it starts, and check it when it ends.
- Write what you learn into How we price.`,
		editedBy: FOUNDER_ID,
		editedDaysAgo: 60,
		skills: [
			{
				title: "Read the payment numbers",
				body: "Read trials, conversions and refunds from Stripe for the period asked. Give the table, then one line on what it says.",
			},
			{
				title: "Read the support desk",
				body: "Read the Zendesk tickets for the period asked. Group them by what people struggled with, biggest group first.",
			},
		],
		memory: [
			"31% of trials became paid last quarter, almost all after a sales call.",
			"Of the 284 who did not pay, 171 stopped at the card form.",
			"Second most common: the trial ended while nobody was looking (62).",
			"Yearly plans still need a call; tests cover monthly plans only.",
			"Trial-end billing has been the top support theme three weeks running.",
			"Support themes run every Monday at 07:00 and cover the week before.",
			"Option B for the pricing page shortens trials to 10 days.",
			"1 in 5 people who pay decide on days 11–14.",
			"Finn reads numbers side by side with last quarter's.",
		],
	},
	{
		agentId: DESIGNER_ID,
		name: "Designer",
		instructions: `# Designer

You lay out pages and write the words on them.

## How you work

- Show your work at two widths: 375 and 1280 px.
- Flag what you are unsure about in the review, so the reviewer looks there first.
- Anything that goes to customers is Maya's to approve.`,
		editedBy: MAYA_ID,
		editedDaysAgo: 35,
		skills: [
			{
				title: "Check a page at two widths",
				body: "Open the page at 375 and 1280 px. Put both in the review, and flag anything that reads differently.",
			},
		],
		memory: [
			"Check every page at 375 and 1280 px wide.",
			"Below 600 px wide, plans stack into one column.",
			"Put the price on top, and flag it when unsure.",
			"Maya approves anything that goes to customers.",
			"Pick subject lines by how often last quarter's emails were opened.",
			"The brand's Figma file is where the colours come from.",
		],
	},
];

/** Facilitation came with Team habits; its memory is what it noted from finished tasks. */
const FACILITATION_MEMORY: readonly string[] = [
	"Trial dates normalised to UTC closed by itself; nobody asked for a review.",
	"Proration math went well: tests first, then the fix.",
	"Round 1 of the trial-end explainer was rejected: it rested on people reading the page.",
	"An assumption a whole fix rests on deserves a line of its own.",
	"Builder stops and asks when something reaches every customer. It works.",
	"Questions with three options get answered faster than open ones.",
	"Designer flags what it is unsure about; those reviews are shorter.",
	"Reviews that show two widths are approved more often in round 1.",
	"Maya sends customer replies herself; agents draft them.",
	"Long tasks read better when the owner keeps the summary up to date.",
	"Finn reads the weekly support themes every Monday.",
	"Two Friday deploys were rolled back in August.",
	"The deploy rule comes from the two Friday rollbacks.",
	"Splitting the checkout page into three parts let each close by itself.",
	"Understanding today before building saved a week on the trials task.",
	"Decisions made in a document are easier to find later than ones made in a thread.",
	"Finn answers questions within a few hours on weekdays.",
	"Parts that wait on another part start by themselves; nobody nudges them.",
	"Two drafts of the day-12 email were enough.",
	"Tickets went from 19 to 14 a week after the pricing page changed.",
	"A note on how a task went is most useful when it names the assumption that broke.",
];

export async function seedAgentFiles(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	for (const agent of OWNED) {
		await db
			.insert(documents)
			.values({
				id: `demo-doc-instructions-${agent.agentId}`,
				scopeKind: "user",
				scopeId: agent.agentId,
				title: `${agent.name} — instructions`,
				body: agent.instructions,
				format: "markdown",
				status: "active",
				slot: "agent_file",
				parentKind: "agent",
				parentId: agent.agentId,
				version: 2,
				updatedBy: agent.editedBy,
				createdAt: clock.daysAgo(81),
				updatedAt: clock.daysAgo(agent.editedDaysAgo),
			})
			.onConflictDoNothing();
		for (const [i, skill] of agent.skills.entries()) {
			await db
				.insert(documents)
				.values({
					id: `demo-doc-skill-${agent.agentId}-${i}`,
					scopeKind: "user",
					scopeId: agent.agentId,
					title: skill.title,
					body: skill.body,
					format: "markdown",
					status: "active",
					slot: "skill",
					updatedBy: agent.editedBy,
					createdAt: clock.daysAgo(80),
					updatedAt: clock.daysAgo(80),
				})
				.onConflictDoNothing();
		}
		await seedMemory(db, clock, agent.agentId, agent.memory);
	}
	await seedMemory(db, clock, FACILITATION_ID, FACILITATION_MEMORY);
}

async function seedMemory(
	db: HyperIdleDb,
	clock: DemoClock,
	agentId: string,
	notes: readonly string[],
): Promise<void> {
	for (const [i, note] of notes.entries()) {
		// Older notes first, one every few days, the newest yesterday.
		const at = clock.daysAgo(1 + (notes.length - 1 - i) * 3);
		await db
			.insert(documents)
			.values({
				id: `demo-doc-memory-${agentId}-${i}`,
				scopeKind: "user",
				scopeId: agentId,
				title: note,
				body: note,
				format: "markdown",
				status: "active",
				slot: "ordinary",
				updatedBy: agentId,
				createdAt: at,
				updatedAt: at,
			})
			.onConflictDoNothing();
	}
}
