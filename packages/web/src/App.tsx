import { DesignSystem } from "./designsystem/DesignSystem.js";
import { AppRouter } from "./router";

/**
 * @lore App routes between the design system and the main router.
 * The /designsystem path bypasses React Router entirely — it is a standalone
 * component explorer, not part of the app's route tree.
 */
export function App(): React.JSX.Element {
	if (window.location.pathname === "/designsystem") {
		return <DesignSystem />;
	}

	return <AppRouter />;
}
