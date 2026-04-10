# Drafthouse

## Package Manager

Always use `bun` for installing packages (not npm/yarn/pnpm).

## Design System

All colors in the frontend must use the token-based design system defined in `src/renderer/src/assets/main.css`. Never use raw color values (e.g. `bg-neutral-900`, `text-white`) — always use semantic tokens:

- `background` — page/app background
- `surface` / `surface-hover` — cards, panels, content containers
- `foreground` — primary text
- `foreground-muted` — secondary/supporting text
- `foreground-subtle` — tertiary/hint text
- `border` — borders and dividers
- `interactive` / `interactive-hover` — secondary buttons, clickable elements
- `accent` / `accent-hover` — primary CTA buttons, key actions
