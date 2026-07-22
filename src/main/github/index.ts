import { registerBranchesHandlers } from './branches'
import { registerCollaboratorsHandlers } from './collaborators'
import { registerCommitsHandlers } from './commits'
import { registerCommitCommentsHandlers } from './commit-comments'
import { registerCommitStatusesHandlers } from './commit-statuses'
import { registerEmojisHandlers } from './emojis'
import { registerPullsHandlers } from './pulls'
import { registerPullDiffStreamHandlers } from './pull-diff-stream'
import { registerPullCommentsHandlers } from './pull-comments'
import { registerReactionsHandlers } from './reactions'
import { registerReviewRequestsHandlers } from './review-requests'
import { registerReviewsHandlers } from './reviews'
import { registerReposHandlers } from './repos'
import { registerUsersHandlers } from './users'

export function registerGitHubHandlers(): void {
  registerReposHandlers()
  registerBranchesHandlers()
  registerCollaboratorsHandlers()
  registerCommitsHandlers()
  registerCommitCommentsHandlers()
  registerCommitStatusesHandlers()
  registerEmojisHandlers()
  registerPullsHandlers()
  registerPullDiffStreamHandlers()
  registerPullCommentsHandlers()
  registerReactionsHandlers()
  registerReviewRequestsHandlers()
  registerReviewsHandlers()
  registerUsersHandlers()
}
