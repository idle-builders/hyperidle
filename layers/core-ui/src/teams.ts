/**
 * Teams are groups of people and agents inside the one organisation: a product team, a function
 * such as sales, or a group that cuts across functions. Conversations and knowledge are always
 * seen across all teams — in knowledge a team is a space — while Work can be narrowed to one team.
 */
export const TEAMS = [
	{ name: "Product", what: "What we build, and how we price it." },
	{ name: "Support", what: "Answers customers, and everything that goes out to them." },
] as const;
export type TeamName = (typeof TEAMS)[number]["name"];
