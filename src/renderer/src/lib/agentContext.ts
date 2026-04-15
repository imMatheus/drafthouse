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
    inline: true
  }
}
