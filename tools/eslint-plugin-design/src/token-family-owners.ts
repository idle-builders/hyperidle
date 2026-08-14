export const OWNED_TOKEN_FAMILIES = [
	"color",
	"radius",
	"spacing",
	"shadow",
	"z-index",
	"font-family",
	"font-size",
	"font-weight",
	"line-height",
	"letter-spacing",
	"duration",
	"easing",
	"border-width",
] as const;

export type OwnedTokenFamily = (typeof OWNED_TOKEN_FAMILIES)[number];

export const TOKEN_FAMILY_OWNERS: Readonly<Record<OwnedTokenFamily, ReadonlySet<string>>> = {
	color: new Set(["no-hardcoded-color", "no-raw-tailwind-color"]),
	radius: new Set(["radius-token-only"]),
	spacing: new Set(["no-off-grid-spacing"]),
	shadow: new Set(["shadow-token-only"]),
	"z-index": new Set(["no-raw-overlay-z"]),
	"font-family": new Set(["typography-profile-only"]),
	"font-size": new Set(["typography-profile-only"]),
	"font-weight": new Set(["typography-profile-only"]),
	"line-height": new Set(["typography-profile-only"]),
	"letter-spacing": new Set(["typography-profile-only"]),
	duration: new Set(["motion-profile-only"]),
	easing: new Set(["motion-profile-only"]),
	"border-width": new Set(["border-width-profile-only"]),
};

export const NON_FAMILIES = {
	"component-geometry": "component-specific responsive bound, not reusable value vocabulary",
} as const;
