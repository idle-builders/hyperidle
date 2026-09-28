export interface DsAttrs {
	"data-ds-component": string;
	"data-ds-tier": "0" | "1" | "2" | "3";
	"data-ds-source": "design-system" | "web-shell";
}

export function dsProps(name: string, tier: "0" | "1" | "2"): DsAttrs {
	return {
		"data-ds-component": name,
		"data-ds-tier": tier,
		"data-ds-source": "design-system",
	};
}
