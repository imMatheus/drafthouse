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
- `accent-bg` — subtle accent-tinted background (e.g. agent prompt bubbles)
- `accent-foreground` — text/icons placed on an `accent` background
- `success` — positive states (open PRs, confirmations)
- `success-foreground` — text/icons placed on a `success` background
- `danger` — destructive/negative states (closed PRs, errors, deletions)
- `danger-foreground` — text/icons placed on a `danger` background
- `purple` — merged state (merged PRs)

## Code Rendering

Use `@pierre/diffs` for all code viewing and diff rendering — this project does **not** use Monaco or Shiki. Shared configuration lives in `src/renderer/src/lib/diffs.ts`: the `drafthouse-dark`/`drafthouse-light` themes (`DIFFS_THEMES`), `BASE_DIFF_OPTIONS` / `BASE_CODE_OPTIONS`, and the helpers `getLanguageFromPath`, `wrapGitPatch`, and `syntheticFilenameForLang`. React components come from `@pierre/diffs/react` (e.g. `MultiFileDiff`, `File`); the diff worker pool is wired up by `WorkerPoolProvider` (`@pierre/diffs/worker`).

- File viewing / single-file diffs: `DiffView.tsx`, `FilesView.tsx`.
- Agent edit diffs: `AgentEditDiffBlock.tsx`. Markdown code blocks: `MarkdownBody.tsx`. Inline review threads: `ReviewThreadCard.tsx`.
- Streamed PR diffs with inline comments: `PRFilesTab.tsx`, backed by `usePullRequestDiffStream.ts` and `prDiffAccumulator.ts` (accumulates streamed file diffs into `@pierre/diffs` CodeView items).

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
