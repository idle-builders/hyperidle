import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RailGlanceStrip } from "../RailGlanceStrip";

describe("RailGlanceStrip (L5)", () => {
	it("renders a single line summarising blocking, burn, anomalies", () => {
		render(
			<RailGlanceStrip
				blockingCount={3}
				burnLabel="$28.40"
				anomaliesCount={0}
				onExpand={() => {}}
			/>,
		);
		expect(screen.getByTestId("rail-glance-strip")).toBeInTheDocument();
		expect(screen.getByTestId("rail-glance-blocking")).toHaveTextContent("Blocking 3");
		expect(screen.getByText(/Burn \$28\.40/)).toBeInTheDocument();
		expect(screen.getByText(/Anomalies 0/)).toBeInTheDocument();
	});

	it("aria-label reads the full summary so screen readers get one phrase", () => {
		render(
			<RailGlanceStrip
				blockingCount={2}
				burnLabel="$14.00"
				anomaliesCount={1}
				onExpand={() => {}}
			/>,
		);
		expect(screen.getByTestId("rail-glance-strip")).toHaveAttribute(
			"aria-label",
			"Open rail glance: Blocking 2 · Burn $14.00 · Anomalies 1",
		);
	});

	it("calls onExpand when tapped", () => {
		const onExpand = vi.fn();
		render(
			<RailGlanceStrip
				blockingCount={3}
				burnLabel="$10.00"
				anomaliesCount={0}
				onExpand={onExpand}
			/>,
		);
		fireEvent.click(screen.getByTestId("rail-glance-strip"));
		expect(onExpand).toHaveBeenCalledTimes(1);
	});

	it("strip has min-h-[44px] for tap-target compliance (AQ-015)", () => {
		render(
			<RailGlanceStrip
				blockingCount={0}
				burnLabel="$0.00"
				anomaliesCount={0}
				onExpand={() => {}}
			/>,
		);
		expect(screen.getByTestId("rail-glance-strip").className).toMatch(/min-h-\[44px\]/);
	});
});
