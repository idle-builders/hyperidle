```markdown
# Design System Specification: Mission-Critical Operations

## 1. Overview & Creative North Star: "The Silent Intelligence"
The design system is engineered for high-stakes environments where cognitive load management is the ultimate priority. The Creative North Star is **"The Silent Intelligence"**—a visual language that remains invisible until interaction is required. It rejects the "noisy" density of legacy dashboards in favor of an editorial, high-precision interface. 

By leveraging intentional asymmetry, sharp geometries, and a monochromatic foundation punctuated by high-signal accents, this system creates a sense of "Mission Control" that is both authoritative and calm. It moves beyond the standard grid by using tonal depth to signify importance, ensuring that the most critical data is always the most luminous.

---

## 2. Colors: Tonal Architecture
The palette is rooted in deep obsidian tones to minimize eye strain during long-duration monitoring.

### Neutral & Surface Hierarchy
Rather than using lines to box in data, we use **Surface Nesting**. 
*   **Base Layer:** `surface` (#0e0e0e) – The foundation of the application.
*   **Sub-Sectioning:** `surface_container_low` (#131313) for secondary sidebars.
*   **Active Workspaces:** `surface_container` (#191a1a) for the primary interaction area.
*   **Floating Elements:** `surface_container_highest` (#252626) for modals and popovers.

### Functional Accents
*   **Primary (Action):** `primary` (#adc6ff) – A precise, high-visibility blue for active states and primary calls to action.
*   **Secondary (Warning):** `secondary` (#d58f24) – A muted amber for "Blocked" or "Attention Required" states. Use sparingly to maintain signal integrity.
*   **Tertiary (Success):** `tertiary` (#bbffb3) – A subtle green for "Healthy" or "Approved" status.

### The "No-Line" Rule
Prohibit the use of 1px solid borders for sectioning large layout areas. Hierarchy must be established through background color shifts (e.g., a `surface_container_low` sidebar against a `surface` background). This reduces visual "vibration" and keeps the focus on the data.

### Signature Textures
Main CTAs and high-level status indicators should utilize a subtle linear gradient from `primary` to `primary_container`. This adds a "lithographic" quality to the UI, making interactive elements feel tactile and premium.

---

## 3. Typography: Technical Authority
We use a dual-font strategy to balance readability with technical "agentic" vibes.

*   **Primary Sans (Inter):** Used for all UI labels, body text, and headlines. It provides a neutral, modern clarity.
*   **Technical Mono (Space Grotesk / Monospace):** Reserved for `label-md` and `label-sm`. Use this for IDs, timestamps, diffs, and raw data strings. This reinforces the "operations center" aesthetic.

### Type Scale
*   **Display/Headline:** Use `headline-sm` (1.5rem) for main dashboard titles. Keep tracking tight (-0.02em).
*   **Body:** `body-md` (0.875rem) is the workhorse. Ensure a line height of 1.5 to maintain legibility in high-density views.
*   **Data Labels:** `label-sm` (0.6875rem) in Space Grotesk. Use All Caps with +0.05em tracking for metadata headers.

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are too "soft" for this system. We achieve depth through **Physical Stacking**.

*   **The Layering Principle:** Depth is achieved by placing a darker surface on a lighter one (or vice versa). A `surface_container_lowest` card sitting on a `surface_container_low` background creates a "inset" look without a single pixel of border.
*   **Ambient Shadows:** For floating menus, use a 32px blur, 0px offset shadow at 8% opacity, tinted with `primary`. This creates a subtle "glow" rather than a heavy drop shadow.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline_variant` token at 15% opacity. Never use 100% opaque borders for containers.
*   **Glassmorphism:** Use `surface_variant` with a 12px backdrop-blur for overlays. This ensures the operator never loses context of the data layers beneath.

---

## 5. Components: High-Density Primitives

### Buttons
*   **Primary:** Solid `primary_container` with `on_primary_container` text. Radius: `sm` (2px).
*   **Secondary:** Ghost style. No background, `outline` border at 20% opacity. Text in `on_surface`.
*   **Tertiary:** `surface_container_high` background. Flat, no border.

### Input Fields
*   **Styling:** Background `surface_container_lowest`, 1px `outline_variant` (20% opacity). 
*   **States:** Focus state shifts border to `primary` at 100% opacity with a subtle 2px outer glow.
*   **Typography:** User input always uses `body-md` (Inter), while prefix/suffix units use `label-sm` (Space Grotesk).

### Cards & Lists
*   **No Dividers:** Prohibit the use of horizontal lines between list items. Use 8px or 12px of vertical whitespace (`spacing scale`) to separate units. 
*   **Hover State:** On hover, the background should shift from `surface` to `surface_container_low`.

### Technical Chips
*   For status (e.g., "STABLE", "DEGRADED"), use a `label-sm` font in a small container with a 2px radius. The background should be a 10% opacity tint of the status color (e.g., `secondary` for Degraded) with a solid 2px "status dot" next to the text.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use `none` or `sm` (2-4px) border radius. Sharp corners convey precision.
*   **Do** utilize Mono fonts for any value that might change frequently (counters, IDs).
*   **Do** prioritize high screen utilization. Information density is a feature, not a bug, provided the hierarchy is clear.
*   **Do** use "Ghost Borders" (low-opacity) only when background shifts aren't enough.

### Don’t
*   **Don’t** use large rounded corners (md, lg, xl). This softens the "mission-critical" feel and wastes corner space.
*   **Don’t** use standard 100% opaque grey borders. It creates "grid-prison" visuals that distract the operator.
*   **Don’t** use vibrant gradients for anything other than primary CTAs. The system should feel monochromatic and serious.
*   **Don’t** use drop shadows for layout elements—only for floating modals.

---

## 7. Spacing & Grid
The system operates on a **4px baseline grid**. All padding, margins, and component heights must be multiples of 4. High-density views should utilize `12px` or `16px` gutters, while internal component padding should stay tight (typically `8px` horizontal, `4px` vertical) to maximize data visibility.```