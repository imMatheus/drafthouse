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

Use `@pierre/diffs` for all code viewing and diff rendering — this project does **not** use Monaco or Shiki directly. Shared configuration lives in `src/renderer/src/lib/diffs.ts` (`DIFFS_THEMES`, `BASE_DIFF_OPTIONS` / `BASE_CODE_OPTIONS`, `getLanguageFromPath`, `wrapGitPatch`, `syntheticFilenameForLang`); the diff worker pool is wired up by `WorkerPoolProvider` (`@pierre/diffs/worker`).

**Never use the standalone `File` / `MultiFileDiff` / `PatchDiff` components from `@pierre/diffs/react`** — they hydrate imperatively from a ref callback and render an empty shell under React StrictMode (i.e. in every dev session). Render through `CodeView` instead: either directly (multi-item viewers) or via the one-item wrappers in `src/renderer/src/components/CodeViewBlock.tsx` (`FileCodeBlock`, `DiffContentsBlock`, `PatchCodeBlock`).

- Prefer diffing two full file contents (`DiffContentsBlock`) over rendering a bare patch: full contents give whole-file-context highlighting and expandable unchanged regions; bare patches (`PatchCodeBlock`) tokenize each hunk from a blank state and are only for cases where contents aren't available (review-thread hunks, REST fallbacks).
- File viewing / single-file diffs: `FilesView.tsx`, `DiffView.tsx` (working-tree view diffs index → worktree; staged view diffs HEAD → index). PR file at a ref: `PullRequestFileView.tsx`.
- Agent edit diffs: `AgentEditDiffBlock.tsx`. Markdown code blocks: `MarkdownBody.tsx`. Inline review threads: `ReviewThreadCard.tsx`.
- Streamed multi-file diffs: `ChangedFilesViewer` in `PRFilesTab.tsx` (file-tree sidebar, virtualized CodeView, viewed/collapse marks, scroll memory, lazy unchanged-region expansion) is shared by the PR files tab and `CommitDetailView.tsx`. It's backed by `useDiffStream.ts` (source: `{kind:'pull'}` or `{kind:'commit'}`, streaming `github:pulls/commits:stream-diff` with a per-file REST fallback) and `prDiffAccumulator.ts`, and upgrades visible files with full contents via `processFile(patch, { oldFile, newFile })`. The optional `review` prop layers on the PR-only machinery (inline threads, drafts, comment gutter, Comments tab, review submission) — don't fork the viewer per surface.
- Code font size (Settings → Editor) is driven by the `--diffs-font-size` / `--diffs-line-height` CSS variables `SettingsProvider` sets on the document root; `@pierre/diffs` reads them from each shadow `:host` and they inherit through the shadow boundary, so every surface scales at once — don't thread font size through per-call-site options. The virtualized viewer also passes a matching `itemMetrics.lineHeight` so scroll estimates stay accurate.

## Agent Integration

The agent is the Claude Code CLI driven from the main process (`src/main/agent.ts`) — one persistent child per session using `--input-format stream-json --output-format stream-json`. Follow-ups and steering are user messages written to stdin (no kill+`--resume` respawn while the process lives); idle children are reaped after 5 minutes and resume transparently via `--resume`. Interrupt, `set_permission_mode`, `set_model` and permission prompts (`can_use_tool`, routed by `--permission-prompt-tool stdio`) flow over the control protocol (`control_request`/`control_response` JSON lines).

- Sessions persist to `userData/agent-sessions/<sessionId>.json` (meta + canonical events, no stream partials) and restore on launch; sessions running at shutdown come back as `interrupted`.
- The renderer mirrors the canonical event log: `AgentSessionsContext` buffers live events until a session is hydrated (`agent:list` + `agent:events`), then applies them by sequence number.
- Stream merging (partials → messages, keyed by `parent_tool_use_id`; per-block final assistant events deduped by `message.id`) lives in `lib/agentStream.ts`. Rendering goes through `lib/agentTimeline.ts` (`buildAgentTimeline`: events → turns of paired tool calls/results, per-turn step groups, sub-agent nesting, permission/plan cards) and the shared `AgentTimelineView.tsx`, used by both `AgentConversation.tsx` (chat tab) and `InlineAgentResponseCard.tsx` (PR views). Don't add per-surface event classification — extend the timeline model instead.
- Permission behavior: `bypassPermissions` by default (Settings → Agent), `plan` via the prompt-bar mode selector; plan approval (ExitPlanMode) and permission prompts render as cards wired to `WorkspaceContext.agentActions`.

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
