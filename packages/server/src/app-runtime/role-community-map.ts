/**
 * AB0: role-to-community mapping via the agent role catalog.
 *
 * @lore AB0: Previously this was a Record<UserRole, string> requiring
 * exhaustive keys for the closed UserRole union. With open role strings,
 * it is now a re-export of communityForRole() from the catalog.
 */
export { communityForRole } from "@hyperidle/shared";
