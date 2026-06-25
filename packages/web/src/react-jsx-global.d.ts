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
	namespace JSX {
		type Element = ReactJSX.Element;
		type IntrinsicElements = ReactJSX.IntrinsicElements;
		type ElementClass = ReactJSX.ElementClass;
		type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
		type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
	}
}
