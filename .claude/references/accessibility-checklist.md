# Accessibility Checklist Reference

Progressive disclosure checklist — load when building or reviewing UI components.

## Keyboard Navigation

- [ ] All interactive elements reachable via Tab
- [ ] Tab order follows visual order (no positive tabindex)
- [ ] Focus visible on all interactive elements (`:focus-visible`)
- [ ] Escape closes modals and dropdowns
- [ ] Enter/Space activates buttons and links
- [ ] Arrow keys navigate within composite widgets (menus, tabs, lists)
- [ ] Focus trapped inside modals (no tabbing out to background)

## Screen Readers

- [ ] All images have alt text (or `alt=""` for decorative)
- [ ] Form inputs have associated labels (`<label htmlFor>` or `aria-label`)
- [ ] Buttons have accessible names (text content or `aria-label`)
- [ ] Icons without text have `aria-label`
- [ ] Status changes announced with `aria-live` regions
- [ ] Headings follow hierarchy (h1 → h2 → h3, no skipping)
- [ ] Landmarks used (`<main>`, `<nav>`, `<aside>`, `<header>`)

## Visual Design

- [ ] Color contrast meets WCAG 2.1 AA (4.5:1 for text, 3:1 for large text)
- [ ] Information not conveyed by color alone (use shape, text, pattern)
- [ ] Text resizable to 200% without loss of content
- [ ] Touch targets minimum 44x44px on mobile
- [ ] No content that flashes more than 3 times per second

## Components (DaisyUI + Custom)

- [ ] Custom components use ARIA roles where appropriate
- [ ] Interactive components have hover, focus, active, and disabled states
- [ ] Loading states announced to screen readers
- [ ] Error messages associated with their inputs (`aria-describedby`)
- [ ] Modals have `role="dialog"` and `aria-modal="true"`

## Testing

- [ ] Playwright tests use role selectors (`getByRole`) not test IDs
- [ ] axe-core or similar automated checks in CI
- [ ] Manual keyboard-only navigation test for new features
