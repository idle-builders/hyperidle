import { DesignSystem } from "./designsystem/DesignSystem.js";
import { AppRouter } from "./router";

/**
 * @lore App routes between the design system and the main router.
 * The /designsystem path bypasses React Router entirely — it is a standalone
 * component explorer, not part of the app's route tree.
 *
 * @lore I4 security MED-3: /designsystem is DEV-only. Stories may mock
 * window.fetch or other globals; shipping the explorer to a production
 * bundle would let a visitor corrupt their tab's runtime. `import.meta.env.DEV`
 * is a Vite compile-time constant, so production builds fully tree-shake
 * the DesignSystem module.
 */
export function App(): React.JSX.Element {
	if (import.meta.env.DEV && window.location.pathname === "/designsystem") {
		return <DesignSystem />;
	}

	return <AppRouter />;
}
