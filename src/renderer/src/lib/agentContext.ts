import type { AgentContext, PullRequestDetail, PullRequestFile } from '../../../shared/types'
import { prStateLabel } from './prMentions'

const MAX_FILES_IN_PROMPT = 50

export function buildPullRequestAgentContext(params: {
  owner: string
  repo: string
  pr: PullRequestDetail
  files?: PullRequestFile[]
}): AgentContext {
  const { owner, repo, pr, files } = params

  let changedFilesList: string
  if (files) {
    const sorted = [...files].sort((a, b) => b.changes - a.changes)
    const listed = sorted.slice(0, MAX_FILES_IN_PROMPT)
    changedFilesList = listed.map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n')
    if (sorted.length > MAX_FILES_IN_PROMPT) {
      changedFilesList += `\n- ... and ${sorted.length - MAX_FILES_IN_PROMPT} more files`
    }
  } else {
    changedFilesList = `${pr.changed_files} files changed (not individually listed)`
  }

  const systemPromptSuffix = [
    `You are assisting with a pull request review.`,
    ``,
    `## Pull Request Details`,
    `- Repository: ${owner}/${repo}`,
    `- PR #${pr.number}: ${pr.title}`,
    `- Author: ${pr.user.login}`,
    `- Branch: \`${pr.head.ref}\` -> \`${pr.base.ref}\``,
    `- Diff stats: +${pr.additions}/-${pr.deletions} across ${pr.changed_files} files`,
    ``,
    pr.body ? `## PR Description\n${pr.body}` : `No PR description provided.`,
    ``,
    `## Changed Files`,
    changedFilesList,
    ``,
    `## Instructions`,
    `- The repository is at the current working directory. The user may or may not be on branch \`${pr.head.ref}\` locally.`,
    `- The base branch is \`${pr.base.ref}\`.`,
    `- When answering questions about the PR, read the relevant source files directly.`,
    `- You can run \`git diff ${pr.base.ref}...${pr.head.ref}\` to see the full diff.`,
    `- Focus your answers on the PR context unless the user asks about something else.`,
    `- If the user asks you to make code changes:`,
    `  - First run \`git branch --show-current\`. If it already shows \`${pr.head.ref}\`, edit files directly in the current working directory.`,
    `  - Otherwise DO NOT run \`git checkout\` / \`git switch\` on the main working directory — that would disrupt the user's local branch. Use a git worktree instead:`,
    `    - Check \`git worktree list\` for an existing worktree on \`${pr.head.ref}\` and \`cd\` into it if one exists.`,
    `    - Otherwise create one: \`git worktree add <path> ${pr.head.ref}\` (pick a sibling path like \`../${repo}-${pr.head.ref.replace(/[^A-Za-z0-9._-]/g, '-')}\`, adjust if it already exists), then \`cd\` into it.`,
    `    - Make all edits and run any builds/tests/formatters from inside the worktree.`,
    `  - After the edits succeed, commit to \`${pr.head.ref}\` with a concise message describing the change and \`git push\` to the remote — unless the user explicitly tells you not to commit or not to push.`,
    `  - Leave any worktree you created in place unless the user asks you to remove it.`
  ].join('\n')

  return {
    source: 'pull-request',
    systemPromptSuffix,
    label: `PR #${pr.number}`,
    inline: true,
    prNumber: pr.number,
    prTitle: pr.title,
    prState: prStateLabel(pr),
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    repoFullName: `${owner}/${repo}`
  }
}

export function buildDiffLineAgentContext(params: {
  owner: string
  repo: string
  pr: PullRequestDetail
  filePath: string
  lineNumber: number
  lineContent: string
  side: 'LEFT' | 'RIGHT'
}): AgentContext {
  const { owner, repo, pr, filePath, lineNumber, lineContent, side } = params
  const sideLabel = side === 'LEFT' ? 'original (deleted)' : 'modified (added/current)'

  const systemPromptSuffix = [
    `You are assisting with a pull request code review on a specific line of code.`,
    ``,
    `## Pull Request Details`,
    `- Repository: ${owner}/${repo}`,
    `- PR #${pr.number}: ${pr.title}`,
    `- Branch: \`${pr.head.ref}\` -> \`${pr.base.ref}\``,
    ``,
    `## Code Context`,
    `- File: \`${filePath}\``,
    `- Line ${lineNumber} (${sideLabel} side)`,
    `\`\`\``,
    lineContent,
    `\`\`\``,
    ``,
    `## Instructions`,
    `- The repository is at the current working directory. The user may or may not be on branch \`${pr.head.ref}\` locally.`,
    `- Read the full file \`${filePath}\` to understand the surrounding context.`,
    `- You can run \`git diff ${pr.base.ref}...${pr.head.ref} -- ${filePath}\` to see the full diff for this file.`,
    `- Focus your answer on the specific line and file referenced above.`,
    `- If the user asks you to make code changes:`,
    `  - First run \`git branch --show-current\`. If it already shows \`${pr.head.ref}\`, edit files directly in the current working directory.`,
    `  - Otherwise DO NOT run \`git checkout\` / \`git switch\` on the main working directory — that would disrupt the user's local branch. Use a git worktree instead:`,
    `    - Check \`git worktree list\` for an existing worktree on \`${pr.head.ref}\` and \`cd\` into it if one exists.`,
    `    - Otherwise create one: \`git worktree add <path> ${pr.head.ref}\` (pick a sibling path like \`../${repo}-${pr.head.ref.replace(/[^A-Za-z0-9._-]/g, '-')}\`, adjust if it already exists), then \`cd\` into it.`,
    `    - Make all edits and run any builds/tests/formatters from inside the worktree.`,
    `  - After the edits succeed, commit to \`${pr.head.ref}\` with a concise message describing the change and \`git push\` to the remote — unless the user explicitly tells you not to commit or not to push.`,
    `  - Leave any worktree you created in place unless the user asks you to remove it.`
  ].join('\n')

  return {
    source: 'pull-request',
    systemPromptSuffix,
    label: `PR #${pr.number}`,
    inline: true,
    filePath,
    lineNumber,
    side,
    prNumber: pr.number,
    prTitle: pr.title,
    prState: prStateLabel(pr),
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    repoFullName: `${owner}/${repo}`
  }
}
