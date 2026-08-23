/**
 * Type declaration for CSS side-effect imports.
 *
 * @lore T1: TypeScript with moduleResolution "bundler" requires explicit type
 * declarations for non-JS side-effect imports. This declaration allows CSS
 * files to be imported as side-effects (i.e., `import "./foo.css"`) without
 * TypeScript errors. The actual CSS loading is handled by Vite/bundler.
 */
declare module "*.css" {
	const _: undefined;
	export default _;
}
