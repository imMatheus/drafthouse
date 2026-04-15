import type { AgentContext, PullRequestDetail, PullRequestFile } from '../../../shared/types'

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
    `- The code for branch \`${pr.head.ref}\` is checked out in the working directory.`,
    `- The base branch is \`${pr.base.ref}\`.`,
    `- When answering questions about the PR, read the relevant source files directly.`,
    `- You can run \`git diff ${pr.base.ref}...${pr.head.ref}\` to see the full diff.`,
    `- Focus your answers on the PR context unless the user asks about something else.`
  ].join('\n')

  return {
    source: 'pull-request',
    systemPromptSuffix,
    label: `PR #${pr.number}`,
    inline: true,
    prNumber: pr.number,
    prTitle: pr.title,
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
    `- The code for branch \`${pr.head.ref}\` is checked out in the working directory.`,
    `- Read the full file \`${filePath}\` to understand the surrounding context.`,
    `- You can run \`git diff ${pr.base.ref}...${pr.head.ref} -- ${filePath}\` to see the full diff for this file.`,
    `- Focus your answer on the specific line and file referenced above.`
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
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    repoFullName: `${owner}/${repo}`
  }
}
