import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "../components/OfflineBanner";

describe("OfflineBanner (L5)", () => {
	it("renders the offline banner when offline=true", () => {
		render(<OfflineBanner offline={true} syncedCount={null} />);
		expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
		expect(screen.getByText(/Offline.*queue/i)).toBeInTheDocument();
	});

	it("renders nothing when online and syncedCount is null", () => {
		const { container } = render(<OfflineBanner offline={false} syncedCount={null} />);
		expect(container.firstChild).toBeNull();
	});

	it("renders the synced toast with singular noun when syncedCount=1", () => {
		render(<OfflineBanner offline={false} syncedCount={1} />);
		expect(screen.getByTestId("synced-toast")).toHaveTextContent("Synced 1 item");
	});

	it("renders the synced toast with plural noun when syncedCount > 1", () => {
		render(<OfflineBanner offline={false} syncedCount={3} />);
		expect(screen.getByTestId("synced-toast")).toHaveTextContent("Synced 3 items");
	});

	it("offline banner uses role=status / aria-live=polite", () => {
		render(<OfflineBanner offline={true} syncedCount={null} />);
		const b = screen.getByTestId("offline-banner");
		expect(b).toHaveAttribute("role", "status");
		expect(b).toHaveAttribute("aria-live", "polite");
	});

	it("offline takes priority — never shows synced toast while offline", () => {
		render(<OfflineBanner offline={true} syncedCount={5} />);
		expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
		expect(screen.queryByTestId("synced-toast")).not.toBeInTheDocument();
	});

	it("synced toast click triggers onDismissSyncedToast", () => {
		const onDismiss = vi.fn();
		render(<OfflineBanner offline={false} syncedCount={2} onDismissSyncedToast={onDismiss} />);
		fireEvent.click(screen.getByTestId("synced-toast").querySelector("button") ?? document.body);
		expect(onDismiss).toHaveBeenCalled();
	});
});
