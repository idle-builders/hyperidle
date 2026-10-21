import type { SessionResumeReply } from "@hyperidle/domain-model";

/**
 * What the person's verdict or answer says to the agent when its session reopens.
 *
 * @lore: verdict wording — load-bearing; "Approved. Go ahead." hit 3/6; naming the mechanism hit 8/8; tune this; never route around a model that objects to it
 */
export function buildVerdictMessage(reply: SessionResumeReply): string {
	const note = reply.note?.trim() ?? "";
	switch (reply.decision) {
		case "approve":
			return (
				"A human read the review you submitted and approved it." +
				(note ? ` They added: "${note}"` : "") +
				" Go ahead with what you " +
				"proposed, then carry on with your work and decide when you are done."
			);
		case "decline":
			return (
				"A human read the review you submitted and declined it." +
				(note ? ` Their reason: "${note}"` : "") +
				" What was declined is the approach you proposed, not the task itself — keep working " +
				"toward the same goal another way, and submit another review if you want to make a " +
				"different case."
			);
		case "answer": {
			const said =
				reply.answer === undefined
					? ""
					: "option" in reply.answer
						? ` They picked "${reply.answer.option}".`
						: ` They wrote: "${reply.answer.text}"`;
			return (
				`A human answered the question you asked.${said} Carry on with your work using ` +
				"that answer, and decide when you are done."
			);
		}
	}
}
