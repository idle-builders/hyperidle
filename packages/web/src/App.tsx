import { AppRouter } from "./router";

/**
 * @lore I6: /designsystem is now integrated into the React Router tree
 * (see router.tsx) instead of using window.location.pathname. This
 * eliminates the hard-coded path check and keeps all routing in one place.
 *
 * @lore I4 security MED-3: /designsystem is DEV-only. The route is
 * conditionally added in router.tsx behind `import.meta.env.DEV`.
 */
export function App(): React.JSX.Element {
	return <AppRouter />;
}
