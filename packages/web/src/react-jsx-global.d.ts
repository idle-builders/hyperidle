/**
 * Make the JSX global namespace available without explicit import.
 *
 * @lore AL5: The AL5 SurfaceBoundary test files use `JSX.Element` return types
 * without importing JSX from React. With `jsx: "react-jsx"` in tsconfig, the
 * JSX runtime is automatic but the JSX *namespace* (JSX.Element, JSX.IntrinsicElements)
 * is NOT globally ambient. This declaration re-exports it from the jsx-runtime
 * so `JSX.Element` is available without an explicit import.
 *
 * This is the standard approach for projects that want JSX types globally
 * (analogous to `skipLibCheck` for JSX users).
 */
import type { JSX as ReactJSX } from "react";

declare global {
	// @lore AL5: AL5 test files (SurfaceBoundary.test.tsx, StripeRefundReview.test.tsx)
	// use `JSX.Element` return types without importing JSX. With `jsx: "react-jsx"`,
	// TypeScript's automatic runtime does NOT put the JSX namespace in global scope.
	// This declaration makes it globally available. The name must be `JSX` (uppercase)
	// to match the TypeScript convention — `Jsx` (lowercase) does NOT work.
	// biome-ignore lint/style/useNamingConvention: TypeScript uses "JSX" (uppercase) as the standard namespace name; Biome's convention of "Jsx" does NOT work for TypeScript's type resolution.
	namespace JSX {
		type Element = ReactJSX.Element;
		type IntrinsicElements = ReactJSX.IntrinsicElements;
		type ElementClass = ReactJSX.ElementClass;
		type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
		type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
	}
}
