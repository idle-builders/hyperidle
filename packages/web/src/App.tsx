import { HintProvider } from "./hooks/useHints";
import { AppRouter } from "./router";

/**
 * @lore P5: HintProvider wraps the entire app tree so all views can call
 * useHint(). A single fetch at boot caches dismissed hint IDs in context.
 * On API failure, hints are not shown (graceful degradation).
 */
export function App(): React.JSX.Element {
	return (
		<HintProvider>
			<AppRouter />
		</HintProvider>
	);
}
