/**
 * Canonical agent ids used across packages.
 *
 * @lore L3: `COACH_AGENT_ID` is the seeded Chief-of-Staff agent. The L3
 * thread list places any thread whose `participants` includes this id at
 * the top of the Pinned section as the Coach/CoS sticky-pin row.
 */
export const COACH_AGENT_ID = "seed-agent-cos" as const;
