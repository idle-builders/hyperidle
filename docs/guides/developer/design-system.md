## Design System

HyperIdle uses a built-in design system browser instead of Storybook.

### Viewing Components

Start the dev server and navigate to [http://localhost:5173/designsystem](http://localhost:5173/designsystem). This route is dev-only and stripped in production.

### Creating Stories

Every custom component must have a `.stories.tsx` file. Stories are auto-discovered via `import.meta.glob` from:

- `packages/web/src/components/*.stories.tsx`
- `packages/web/src/shell/*.stories.tsx`
- `packages/web/src/pages/*.stories.tsx`
- `packages/web/src/layouts/*.stories.tsx`

Story format (CSF3-style):

```tsx
// MyComponent.stories.tsx
import { MyComponent } from "./MyComponent";

export default {
  title: "Components/MyComponent",
};

export function Default() {
  return <MyComponent>Hello</MyComponent>;
}

export function WithError() {
  return <MyComponent error>Something went wrong</MyComponent>;
}
```

### Design Rules

- **limited custom components** — everything else uses DaisyUI primitives directly
- **Tailwind CSS + DaisyUI** with the `factory-dark` theme
- **Avoid the "AI Aesthetic"**: no excessive gradients, no `rounded-2xl`, no `p-8`/`p-12` oversized padding. Think Bloomberg terminal, not marketing landing page
- 8-12px padding default, dense information display
