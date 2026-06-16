import { NotFound } from "./NotFound";

// AJ6 W5: area-less title — no "Page: Area/*" prefix, no area subdir.
// Requires explicit meta.group; System is the correct domain (infrastructure/fallback page).
export default { title: "NotFound", group: "System" as const };

export const Default = (): React.JSX.Element => <NotFound />;
