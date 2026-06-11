// AE6 RED — Component tests for kind renderers and fallback renderer.
// Source of truth: plans/AE6/architecture.md §11 AC-2
// plans/AE6/design/approved.md §3 (renderer details)
//
// These tests will FAIL until the green phase creates the implementations.

// AF16 T9: renderer imports updated — moved from packages/web/src/kinds/ to @hyperidle/design-system
import {
	CodeRenderer,
	DataRenderer,
	FallbackRenderer,
	getRenderer,
	HtmlRenderer,
	ImageRenderer,
	TextRenderer,
	UrlRenderer,
} from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it } from "vitest";

// -------------------------------------------------------------------
// TextRenderer
// -------------------------------------------------------------------

describe("TextRenderer", () => {
	it("renders prose body content", () => {
		render(<TextRenderer preview={{ kind: "text", body: "Hello world" }} kind="text" />);
		expect(screen.getByText("Hello world")).toBeInTheDocument();
	});

	it("renders empty state when preview has no body", () => {
		render(<TextRenderer preview={null} kind="text" />);
		expect(screen.getByText(/no content preview/i)).toBeInTheDocument();
	});

	it("renders empty state when preview is null", () => {
		render(<TextRenderer preview={null} kind="text" />);
		expect(document.body.textContent).toBeTruthy();
	});
});

// -------------------------------------------------------------------
// CodeRenderer
// -------------------------------------------------------------------

describe("CodeRenderer", () => {
	const codePreview = {
		kind: "code" as const,
		file: "src/index.ts",
		hunks: [
			{
				header: "@@ -1,3 +1,4 @@",
				lines: [
					{ kind: "add" as const, text: "const y = 3;" },
					{ kind: "del" as const, text: "const y = 2;" },
					{ kind: "ctx" as const, text: "const x = 1;" },
				],
			},
		],
	};

	it("renders the file path header", () => {
		render(<CodeRenderer preview={codePreview} kind="code" />);
		expect(screen.getByText("src/index.ts")).toBeInTheDocument();
	});

	it("renders diff lines", () => {
		render(<CodeRenderer preview={codePreview} kind="code" />);
		expect(screen.getByText("const y = 3;")).toBeInTheDocument();
		expect(screen.getByText("const y = 2;")).toBeInTheDocument();
	});

	it("renders empty state when preview has no hunks", () => {
		render(<CodeRenderer preview={{ kind: "code", file: "src/x.ts", hunks: [] }} kind="code" />);
		expect(screen.getByText(/no diff/i)).toBeInTheDocument();
	});

	it("renders empty state when preview is null", () => {
		render(<CodeRenderer preview={null} kind="code" />);
		expect(document.body.textContent).toBeTruthy();
	});
});

// -------------------------------------------------------------------
// ImageRenderer
// -------------------------------------------------------------------

describe("ImageRenderer", () => {
	const imagePreview = {
		kind: "image" as const,
		url: "https://example.com/screenshot.png",
		width: 1920,
		height: 1080,
		alt: "Dashboard screenshot",
	};

	it("renders the image element", () => {
		render(<ImageRenderer preview={imagePreview} kind="image" />);
		const img = screen.getByRole("img");
		expect(img).toBeInTheDocument();
		expect(img).toHaveAttribute("src", "https://example.com/screenshot.png");
	});

	it("renders image dimensions", () => {
		render(<ImageRenderer preview={imagePreview} kind="image" />);
		expect(screen.getByText(/1920/)).toBeInTheDocument();
		expect(screen.getByText(/1080/)).toBeInTheDocument();
	});

	it("uses alt text on the img element", () => {
		render(<ImageRenderer preview={imagePreview} kind="image" />);
		expect(screen.getByAltText("Dashboard screenshot")).toBeInTheDocument();
	});

	it("renders empty state when preview is null", () => {
		render(<ImageRenderer preview={null} kind="image" />);
		expect(screen.getByText(/image pending/i)).toBeInTheDocument();
	});
});

// -------------------------------------------------------------------
// DataRenderer
// -------------------------------------------------------------------

describe("DataRenderer", () => {
	const dataPreview = {
		kind: "data" as const,
		headlines: [
			{ label: "DAU", value: "1.2k" },
			{ label: "MRR", value: "$42k" },
		],
	};

	it("renders headline metrics", () => {
		render(<DataRenderer preview={dataPreview} kind="data" />);
		expect(screen.getByText("DAU")).toBeInTheDocument();
		expect(screen.getByText("1.2k")).toBeInTheDocument();
		expect(screen.getByText("MRR")).toBeInTheDocument();
		expect(screen.getByText("$42k")).toBeInTheDocument();
	});

	it("renders empty state when no headlines and no charts", () => {
		render(<DataRenderer preview={{ kind: "data", headlines: [] }} kind="data" />);
		expect(screen.getByText(/no metrics/i)).toBeInTheDocument();
	});

	it("renders optional table rows when present", () => {
		render(
			<DataRenderer
				preview={{
					kind: "data",
					headlines: [{ label: "Count", value: "5" }],
					rows: [{ name: "Alpha", value: "1" }],
				}}
				kind="data"
			/>,
		);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
	});

	it("renders empty state when preview is null", () => {
		render(<DataRenderer preview={null} kind="data" />);
		expect(screen.getByText(/no metrics/i)).toBeInTheDocument();
	});
});

// -------------------------------------------------------------------
// HtmlRenderer
// -------------------------------------------------------------------

describe("HtmlRenderer", () => {
	const htmlPreview = {
		kind: "html" as const,
		html: "<h1>Dashboard</h1>",
		title: "Q4 Dashboard",
	};

	it("renders a sandboxed iframe", () => {
		render(<HtmlRenderer preview={htmlPreview} kind="html" />);
		const iframe = document.querySelector("iframe");
		expect(iframe).toBeInTheDocument();
	});

	it("iframe has sandbox attribute with allow-scripts only (no allow-same-origin)", () => {
		render(<HtmlRenderer preview={htmlPreview} kind="html" />);
		const iframe = document.querySelector("iframe");
		expect(iframe).toHaveAttribute("sandbox");
		const sandbox = iframe?.getAttribute("sandbox") ?? "";
		expect(sandbox).toContain("allow-scripts");
		// Security: must NOT have allow-same-origin
		expect(sandbox).not.toContain("allow-same-origin");
		// Security: must NOT have allow-forms
		expect(sandbox).not.toContain("allow-forms");
		// Security: must NOT have allow-popups
		expect(sandbox).not.toContain("allow-popups");
	});

	it("renders optional title when present", () => {
		render(<HtmlRenderer preview={htmlPreview} kind="html" />);
		expect(screen.getByText("Q4 Dashboard")).toBeInTheDocument();
	});

	it("renders empty state when preview is null", () => {
		render(<HtmlRenderer preview={null} kind="html" />);
		expect(screen.getByText(/html preview pending/i)).toBeInTheDocument();
	});
});

// -------------------------------------------------------------------
// UrlRenderer
// -------------------------------------------------------------------

describe("UrlRenderer", () => {
	const urlPreview = {
		kind: "url" as const,
		url: "https://example.com/service",
		status: "ok" as const,
		statusLabel: "Healthy",
	};

	it("renders the URL as a clickable link", () => {
		render(<UrlRenderer preview={urlPreview} kind="url" />);
		const link = screen.getByRole("link");
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "https://example.com/service");
	});

	it("opens URL in new tab", () => {
		render(<UrlRenderer preview={urlPreview} kind="url" />);
		const link = screen.getByRole("link");
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("renders status label when present", () => {
		render(<UrlRenderer preview={urlPreview} kind="url" />);
		expect(screen.getByText("Healthy")).toBeInTheDocument();
	});

	it("renders just the link when no status fields", () => {
		render(<UrlRenderer preview={{ kind: "url", url: "https://example.com" }} kind="url" />);
		const link = screen.getByRole("link");
		expect(link).toBeInTheDocument();
	});

	it("renders empty state when preview is null", () => {
		render(<UrlRenderer preview={null} kind="url" />);
		expect(screen.getByText(/no url/i)).toBeInTheDocument();
	});
});

// -------------------------------------------------------------------
// FallbackRenderer — for unregistered kinds
// -------------------------------------------------------------------

describe("FallbackRenderer", () => {
	it("renders key-value pairs for preview data fields", () => {
		render(
			<FallbackRenderer
				preview={{ title: "Hello", status: "draft", wordCount: 2400 }}
				kind="blog_post"
			/>,
		);
		// Should render field names and values
		expect(screen.getByText("title")).toBeInTheDocument();
		expect(screen.getByText("Hello")).toBeInTheDocument();
	});

	it("renders the raw kind string in the empty state when no preview", () => {
		render(<FallbackRenderer preview={null} kind="blog_post" />);
		expect(screen.getByText(/blog_post/)).toBeInTheDocument();
	});

	it("never crashes with arbitrary preview JSON", () => {
		// Should not throw regardless of preview shape
		expect(() => {
			render(
				<FallbackRenderer
					preview={{ nested: { deep: true }, arr: [1, 2, 3], num: 42 }}
					kind="exotic_kind"
				/>,
			);
		}).not.toThrow();
	});

	it("renders empty-state message for invalid/null preview data", () => {
		render(<FallbackRenderer preview={null} kind="mystery_kind" />);
		// Should show some text mentioning the kind
		expect(document.body.textContent).toContain("mystery_kind");
	});
});

// -------------------------------------------------------------------
// Renderer registry
// -------------------------------------------------------------------

describe("getRenderer (renderer-registry)", () => {
	it("returns a component for each registered kind", () => {
		for (const kind of ["text", "code", "image", "data", "html", "url"]) {
			const Renderer = getRenderer(kind);
			expect(Renderer).toBeDefined();
			expect(typeof Renderer).toBe("function");
		}
	});

	it("returns FallbackRenderer for unregistered kinds", () => {
		const Renderer = getRenderer("blog_post");
		expect(Renderer).toBeDefined();
		// Should render without crashing
		expect(() => {
			render(
				<Suspense fallback={<div>loading...</div>}>
					<Renderer preview={{ title: "test" }} kind="blog_post" />
				</Suspense>,
			);
		}).not.toThrow();
	});
});
