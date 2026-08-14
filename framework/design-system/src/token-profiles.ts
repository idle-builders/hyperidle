import type { CSSProperties } from "react";

export const TYPOGRAPHY_ROLES = [
	"label",
	"metadata",
	"small",
	"copy",
	"control",
	"input",
	"avatar-initial",
	"subheading",
	"lead",
	"title",
	"display",
	"metric",
	"data",
	"inline-code",
] as const;

export type TypographyRole = (typeof TYPOGRAPHY_ROLES)[number];

type CompleteTypographyStyle = Pick<
	CSSProperties,
	"fontFamily" | "fontSize" | "fontWeight" | "letterSpacing" | "lineHeight"
> &
	Pick<CSSProperties, never> & { fontVariantNumeric?: CSSProperties["fontVariantNumeric"] };

const sans = "var(--font-sans)";
const mono = "var(--font-mono)";

/** Complete public typography definitions. Raw fields stay private to this registry. */
export const TYPE_STYLE = {
	label: {
		fontFamily: sans,
		fontSize: "11px",
		fontWeight: 600,
		letterSpacing: "0.06em",
		lineHeight: 1.25,
	},
	metadata: {
		fontFamily: sans,
		fontSize: "12px",
		fontWeight: 500,
		letterSpacing: "0",
		lineHeight: 1.4,
	},
	small: {
		fontFamily: sans,
		fontSize: "13px",
		fontWeight: 400,
		letterSpacing: "0",
		lineHeight: 1.4,
	},
	copy: {
		fontFamily: sans,
		fontSize: "15px",
		fontWeight: 400,
		letterSpacing: "0",
		lineHeight: 1.55,
	},
	control: {
		fontFamily: sans,
		fontSize: "13px",
		fontWeight: 500,
		letterSpacing: "0",
		lineHeight: 1.25,
	},
	input: {
		fontFamily: sans,
		fontSize: "13px",
		fontWeight: 400,
		letterSpacing: "0",
		lineHeight: 1.4,
	},
	"avatar-initial": {
		fontFamily: sans,
		fontSize: "12px",
		fontWeight: 600,
		letterSpacing: "0",
		lineHeight: 1,
	},
	subheading: {
		fontFamily: sans,
		fontSize: "15px",
		fontWeight: 600,
		letterSpacing: "0",
		lineHeight: 1.4,
	},
	lead: {
		fontFamily: sans,
		fontSize: "17px",
		fontWeight: 600,
		letterSpacing: "-0.01em",
		lineHeight: 1.25,
	},
	title: {
		fontFamily: sans,
		fontSize: "20px",
		fontWeight: 600,
		letterSpacing: "-0.01em",
		lineHeight: 1.4,
	},
	display: {
		fontFamily: sans,
		fontSize: "24px",
		fontWeight: 600,
		letterSpacing: "-0.01em",
		lineHeight: 1.25,
	},
	metric: {
		fontFamily: sans,
		fontSize: "24px",
		fontWeight: 600,
		letterSpacing: "-0.01em",
		lineHeight: 1,
		fontVariantNumeric: "tabular-nums",
	},
	data: {
		fontFamily: mono,
		fontSize: "12px",
		fontWeight: 500,
		letterSpacing: "0",
		lineHeight: 1.4,
	},
	"inline-code": {
		fontFamily: mono,
		fontSize: "13px",
		fontWeight: 400,
		letterSpacing: "0",
		lineHeight: 1.55,
	},
} as const satisfies Record<TypographyRole, CompleteTypographyStyle>;

export const AVATAR_INITIAL_STYLE = {
	stacked: { ...TYPE_STYLE["avatar-initial"], fontSize: "9px" },
	sm: { ...TYPE_STYLE["avatar-initial"], fontSize: "10px" },
	md: TYPE_STYLE["avatar-initial"],
	lg: { ...TYPE_STYLE["avatar-initial"], fontSize: "13px" },
} as const;

export const MOTION_PROFILES = [
	"feedback",
	"move",
	"spring",
	"enter",
	"activity",
	"loading",
	"busy",
] as const;
export type MotionProfile = (typeof MOTION_PROFILES)[number];

export const MOTION_STYLE = {
	feedback: {
		transitionDuration: "120ms",
		transitionProperty: "opacity, filter",
		transitionTimingFunction: "var(--motion-ease)",
	},
	move: {
		transitionDuration: "240ms",
		transitionProperty: "transform",
		transitionTimingFunction: "var(--motion-ease)",
	},
	spring: {
		transitionDuration: "240ms",
		transitionProperty: "transform",
		transitionTimingFunction: "var(--easing-expressive)",
	},
	enter: { animation: "hearth-enter 120ms ease-out 1" },
	activity: { animation: "hearth-activity 1.4s ease-in-out infinite" },
	loading: { animation: "hearth-loading 1.8s ease-in-out infinite" },
	busy: { animation: "hearth-busy 750ms linear infinite" },
} as const satisfies Record<MotionProfile, CSSProperties>;

export const BORDER_WIDTH_PROFILES = ["thin", "default", "strong"] as const;
export type BorderWidthProfile = (typeof BORDER_WIDTH_PROFILES)[number];

export const BORDER_WIDTH_STYLE = {
	thin: "var(--bw-thin)",
	default: "var(--bw-default)",
	strong: "var(--bw-strong)",
} as const satisfies Record<BorderWidthProfile, string>;
