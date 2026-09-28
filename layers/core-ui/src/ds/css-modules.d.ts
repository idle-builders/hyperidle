/**
 * Type declaration for CSS side-effect imports.
 *
 * @lore moduleResolution "bundler" requires explicit type for CSS side-effect imports; actual loading is handled by Vite
 */
declare module "*.css" {
	const _: undefined;
	export default _;
}
