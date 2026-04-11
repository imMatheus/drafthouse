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
- `success` — positive states (open PRs, confirmations)
- `danger` — destructive/negative states (closed PRs, errors, deletions)
- `purple` — merged state (merged PRs)

## Code Rendering

Use `shiki` for all syntax highlighting. The highlighter is set up in `src/renderer/src/lib/shiki.ts` using the JavaScript regex engine (`@shikijs/engine-javascript`) with vitesse-dark / vitesse-light themes. Use `tokenizeCode` for full files, `tokenizeDiffHunks` for PR diffs, and `tokenizeReviewPreviewLines` for review thread previews. Detect the language from file paths with `getLanguageFromPath`. Never render raw code in `<pre><code>` without highlighting.

## Icons

Always use `lucide-react` for icons. Never use inline SVGs — import the icon component from `lucide-react` instead.

## Class Names

Use the `cn()` utility from `src/renderer/src/lib/cn.ts` for combining Tailwind classes. Never use template literal strings for conditional classNames — use `cn()` instead.

## General guidelines

Always ask me question if you are unclear about anything.
Avoid throwing when possible, unless they're in very local cases.
Avoid useMemo and useCallback. We try not to cache. Bad for memory usage, perf predictability and debugging.
Avoid observer patterns. They promote an illusion of loose coupling within a codebase where nothing's actually loose. They also cause all sorts of asynchronicity problems. Prefer regular functions at the right call sites.
For fetch, don't add fields whose value are the default value.
Tailwind: prefer `size-N` over `w-N h-N` when width and height are the same.

It's hard to compose functions that have side-effects. For example, yes it's convenient for an async function to contain a popToastError, but just return a proper error instead, especially when Promises have dedicated error/rejection mechanisms.
