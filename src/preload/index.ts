import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  auth: {
    login: (): Promise<unknown> => ipcRenderer.invoke('auth:login'),
    logout: (): Promise<unknown> => ipcRenderer.invoke('auth:logout'),
    getUser: (): Promise<unknown> => ipcRenderer.invoke('auth:get-user'),
    onDeviceCode: (callback: (data: { userCode: string }) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, data: { userCode: string }): void => callback(data)
      ipcRenderer.on('auth:device-code', listener)
      return () => ipcRenderer.removeListener('auth:device-code', listener)
    }
  },
  github: {
    repos: {
      list: (query?: string): Promise<unknown> => ipcRenderer.invoke('github:repos:list', query),
      getContent: (owner: string, repo: string, path: string, ref: string): Promise<unknown> =>
        ipcRenderer.invoke('github:repos:get-content', owner, repo, path, ref)
    },
    branches: {
      list: (
        owner: string,
        repo: string,
        options?: { protected?: boolean; perPage?: number; page?: number }
      ): Promise<unknown> => ipcRenderer.invoke('github:branches:list', owner, repo, options),
      get: (owner: string, repo: string, branch: string): Promise<unknown> =>
        ipcRenderer.invoke('github:branches:get', owner, repo, branch),
      rename: (owner: string, repo: string, branch: string, newName: string): Promise<unknown> =>
        ipcRenderer.invoke('github:branches:rename', owner, repo, branch, newName),
      syncFork: (owner: string, repo: string, branch: string): Promise<unknown> =>
        ipcRenderer.invoke('github:branches:sync-fork', owner, repo, branch),
      merge: (owner: string, repo: string, base: string, head: string, commitMessage?: string): Promise<unknown> =>
        ipcRenderer.invoke('github:branches:merge', owner, repo, base, head, commitMessage)
    },
    collaborators: {
      list: (
        owner: string,
        repo: string,
        options?: {
          affiliation?: string
          permission?: string
          perPage?: number
          page?: number
        }
      ): Promise<unknown> => ipcRenderer.invoke('github:collaborators:list', owner, repo, options),
      check: (owner: string, repo: string, username: string): Promise<unknown> =>
        ipcRenderer.invoke('github:collaborators:check', owner, repo, username),
      add: (owner: string, repo: string, username: string, permission?: string): Promise<unknown> =>
        ipcRenderer.invoke('github:collaborators:add', owner, repo, username, permission),
      remove: (owner: string, repo: string, username: string): Promise<unknown> =>
        ipcRenderer.invoke('github:collaborators:remove', owner, repo, username),
      getPermission: (owner: string, repo: string, username: string): Promise<unknown> =>
        ipcRenderer.invoke('github:collaborators:get-permission', owner, repo, username)
    },
    commits: {
      list: (
        owner: string,
        repo: string,
        options?: {
          sha?: string
          path?: string
          author?: string
          committer?: string
          since?: string
          until?: string
          perPage?: number
          page?: number
        }
      ): Promise<unknown> => ipcRenderer.invoke('github:commits:list', owner, repo, options),
      get: (
        owner: string,
        repo: string,
        ref: string,
        options?: { page?: number; perPage?: number }
      ): Promise<unknown> => ipcRenderer.invoke('github:commits:get', owner, repo, ref, options),
      compare: (
        owner: string,
        repo: string,
        basehead: string,
        options?: { page?: number; perPage?: number }
      ): Promise<unknown> => ipcRenderer.invoke('github:commits:compare', owner, repo, basehead, options),
      listBranchesForHead: (owner: string, repo: string, commitSha: string): Promise<unknown> =>
        ipcRenderer.invoke('github:commits:list-branches-for-head', owner, repo, commitSha),
      listPullRequests: (
        owner: string,
        repo: string,
        commitSha: string,
        options?: { perPage?: number; page?: number }
      ): Promise<unknown> => ipcRenderer.invoke('github:commits:list-pull-requests', owner, repo, commitSha, options)
    },
    commitComments: {
      listForRepo: (owner: string, repo: string, options?: { perPage?: number; page?: number }): Promise<unknown> =>
        ipcRenderer.invoke('github:commit-comments:list-for-repo', owner, repo, options),
      get: (owner: string, repo: string, commentId: number): Promise<unknown> =>
        ipcRenderer.invoke('github:commit-comments:get', owner, repo, commentId),
      update: (owner: string, repo: string, commentId: number, body: string): Promise<unknown> =>
        ipcRenderer.invoke('github:commit-comments:update', owner, repo, commentId, body),
      delete: (owner: string, repo: string, commentId: number): Promise<unknown> =>
        ipcRenderer.invoke('github:commit-comments:delete', owner, repo, commentId),
      listForCommit: (
        owner: string,
        repo: string,
        commitSha: string,
        options?: { perPage?: number; page?: number }
      ): Promise<unknown> =>
        ipcRenderer.invoke('github:commit-comments:list-for-commit', owner, repo, commitSha, options),
      create: (
        owner: string,
        repo: string,
        commitSha: string,
        body: string,
        path?: string,
        position?: number
      ): Promise<unknown> =>
        ipcRenderer.invoke('github:commit-comments:create', owner, repo, commitSha, body, path, position)
    },
    commitStatuses: {
      getCombined: (
        owner: string,
        repo: string,
        ref: string,
        options?: { perPage?: number; page?: number }
      ): Promise<unknown> => ipcRenderer.invoke('github:commit-statuses:get-combined', owner, repo, ref, options),
      list: (
        owner: string,
        repo: string,
        ref: string,
        options?: { perPage?: number; page?: number }
      ): Promise<unknown> => ipcRenderer.invoke('github:commit-statuses:list', owner, repo, ref, options),
      create: (
        owner: string,
        repo: string,
        sha: string,
        state: string,
        options?: { targetUrl?: string | null; description?: string | null; context?: string }
      ): Promise<unknown> => ipcRenderer.invoke('github:commit-statuses:create', owner, repo, sha, state, options)
    },
    emojis: {
      get: (): Promise<unknown> => ipcRenderer.invoke('github:emojis:get')
    },
    pulls: {
      list: (
        owner: string,
        repo: string,
        options?: {
          state?: string
          head?: string
          base?: string
          sort?: string
          direction?: string
          perPage?: number
          page?: number
        }
      ): Promise<unknown> => ipcRenderer.invoke('github:pulls:list', owner, repo, options),
      get: (owner: string, repo: string, number: number): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:get', owner, repo, number),
      create: (owner: string, repo: string, input: unknown): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:create', owner, repo, input),
      update: (owner: string, repo: string, number: number, input: unknown): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:update', owner, repo, number, input),
      close: (owner: string, repo: string, number: number): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:close', owner, repo, number),
      reopen: (owner: string, repo: string, number: number): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:reopen', owner, repo, number),
      listCommits: (owner: string, repo: string, number: number, page?: number, perPage?: number): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:list-commits', owner, repo, number, page, perPage),
      listFiles: (owner: string, repo: string, number: number): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:list-files', owner, repo, number),
      checkMerged: (owner: string, repo: string, number: number): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:check-merged', owner, repo, number),
      merge: (
        owner: string,
        repo: string,
        number: number,
        mergeMethod: string,
        commitTitle?: string,
        commitMessage?: string
      ): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:merge', owner, repo, number, mergeMethod, commitTitle, commitMessage),
      updateBranch: (owner: string, repo: string, number: number, expectedHeadSha?: string): Promise<unknown> =>
        ipcRenderer.invoke('github:pulls:update-branch', owner, repo, number, expectedHeadSha),
      convertToDraft: (nodeId: string): Promise<unknown> => ipcRenderer.invoke('github:pulls:convert-to-draft', nodeId),
      markReady: (nodeId: string): Promise<unknown> => ipcRenderer.invoke('github:pulls:mark-ready', nodeId)
    },
    pullComments: {
      listIssueComments: (owner: string, repo: string, number: number): Promise<unknown> =>
        ipcRenderer.invoke('github:pull-comments:list-issue-comments', owner, repo, number),
      createIssueComment: (owner: string, repo: string, number: number, body: string): Promise<unknown> =>
        ipcRenderer.invoke('github:pull-comments:create-issue-comment', owner, repo, number, body),
      listForPull: (
        owner: string,
        repo: string,
        number: number,
        options?: {
          sort?: string
          direction?: string
          since?: string
          perPage?: number
          page?: number
        }
      ): Promise<unknown> => ipcRenderer.invoke('github:pull-comments:list-for-pull', owner, repo, number, options),
      listForRepo: (
        owner: string,
        repo: string,
        options?: {
          sort?: string
          direction?: string
          since?: string
          perPage?: number
          page?: number
        }
      ): Promise<unknown> => ipcRenderer.invoke('github:pull-comments:list-for-repo', owner, repo, options),
      get: (owner: string, repo: string, commentId: number): Promise<unknown> =>
        ipcRenderer.invoke('github:pull-comments:get', owner, repo, commentId),
      create: (owner: string, repo: string, number: number, input: unknown): Promise<unknown> =>
        ipcRenderer.invoke('github:pull-comments:create', owner, repo, number, input),
      createReply: (owner: string, repo: string, number: number, commentId: number, body: string): Promise<unknown> =>
        ipcRenderer.invoke('github:pull-comments:create-reply', owner, repo, number, commentId, body),
      update: (owner: string, repo: string, commentId: number, body: string): Promise<unknown> =>
        ipcRenderer.invoke('github:pull-comments:update', owner, repo, commentId, body),
      delete: (owner: string, repo: string, commentId: number): Promise<unknown> =>
        ipcRenderer.invoke('github:pull-comments:delete', owner, repo, commentId)
    },
    reviewRequests: {
      get: (owner: string, repo: string, number: number): Promise<unknown> =>
        ipcRenderer.invoke('github:review-requests:get', owner, repo, number),
      request: (
        owner: string,
        repo: string,
        number: number,
        reviewers?: string[],
        teamReviewers?: string[]
      ): Promise<unknown> =>
        ipcRenderer.invoke('github:review-requests:request', owner, repo, number, reviewers, teamReviewers),
      remove: (
        owner: string,
        repo: string,
        number: number,
        reviewers: string[],
        teamReviewers?: string[]
      ): Promise<unknown> =>
        ipcRenderer.invoke('github:review-requests:remove', owner, repo, number, reviewers, teamReviewers)
    },
    reviews: {
      list: (
        owner: string,
        repo: string,
        number: number,
        options?: { perPage?: number; page?: number }
      ): Promise<unknown> => ipcRenderer.invoke('github:reviews:list', owner, repo, number, options),
      get: (owner: string, repo: string, number: number, reviewId: number): Promise<unknown> =>
        ipcRenderer.invoke('github:reviews:get', owner, repo, number, reviewId),
      create: (owner: string, repo: string, number: number, input: unknown): Promise<unknown> =>
        ipcRenderer.invoke('github:reviews:create', owner, repo, number, input),
      update: (owner: string, repo: string, number: number, reviewId: number, body: string): Promise<unknown> =>
        ipcRenderer.invoke('github:reviews:update', owner, repo, number, reviewId, body),
      deletePending: (owner: string, repo: string, number: number, reviewId: number): Promise<unknown> =>
        ipcRenderer.invoke('github:reviews:delete-pending', owner, repo, number, reviewId),
      listComments: (
        owner: string,
        repo: string,
        number: number,
        reviewId: number,
        options?: { perPage?: number; page?: number }
      ): Promise<unknown> => ipcRenderer.invoke('github:reviews:list-comments', owner, repo, number, reviewId, options),
      dismiss: (
        owner: string,
        repo: string,
        number: number,
        reviewId: number,
        message: string,
        event?: string
      ): Promise<unknown> =>
        ipcRenderer.invoke('github:reviews:dismiss', owner, repo, number, reviewId, message, event),
      submitPending: (
        owner: string,
        repo: string,
        number: number,
        reviewId: number,
        reviewEvent: string,
        body?: string
      ): Promise<unknown> =>
        ipcRenderer.invoke('github:reviews:submit-pending', owner, repo, number, reviewId, reviewEvent, body)
    },
    reactions: {
      listForIssueComment: (owner: string, repo: string, commentId: number): Promise<unknown> =>
        ipcRenderer.invoke('github:reactions:list-for-issue-comment', owner, repo, commentId),
      createForIssueComment: (owner: string, repo: string, commentId: number, content: string): Promise<unknown> =>
        ipcRenderer.invoke('github:reactions:create-for-issue-comment', owner, repo, commentId, content),
      listForPullComment: (owner: string, repo: string, commentId: number): Promise<unknown> =>
        ipcRenderer.invoke('github:reactions:list-for-pull-comment', owner, repo, commentId),
      createForPullComment: (owner: string, repo: string, commentId: number, content: string): Promise<unknown> =>
        ipcRenderer.invoke('github:reactions:create-for-pull-comment', owner, repo, commentId, content),
      delete: (owner: string, repo: string, reactionId: number): Promise<unknown> =>
        ipcRenderer.invoke('github:reactions:delete', owner, repo, reactionId)
    }
  },
  agent: {
    start: (cwd: string, prompt: string, files?: string[], appendSystemPrompt?: string): Promise<unknown> =>
      ipcRenderer.invoke('agent:start', cwd, prompt, files ?? null, appendSystemPrompt ?? null),
    continue: (
      sessionId: string,
      cliSessionId: string,
      cwd: string,
      prompt: string,
      files?: string[]
    ): Promise<unknown> => ipcRenderer.invoke('agent:continue', sessionId, cliSessionId, cwd, prompt, files),
    stop: (sessionId: string): Promise<unknown> => ipcRenderer.invoke('agent:stop', sessionId),
    listSessions: (): Promise<unknown> => ipcRenderer.invoke('agent:list-sessions'),
    onEvent: (callback: (data: { sessionId: string; event: unknown }) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, data: { sessionId: string; event: unknown }): void => callback(data)
      ipcRenderer.on('agent:event', listener)
      return () => ipcRenderer.removeListener('agent:event', listener)
    }
  },
  git: {
    status: (cwd: string): Promise<unknown> => ipcRenderer.invoke('git:status', cwd),
    branchInfo: (cwd: string): Promise<unknown> => ipcRenderer.invoke('git:branch-info', cwd),
    diff: (cwd: string, filePath: string, staged: boolean): Promise<unknown> =>
      ipcRenderer.invoke('git:diff', cwd, filePath, staged),
    showFile: (cwd: string, filePath: string): Promise<unknown> => ipcRenderer.invoke('git:show-file', cwd, filePath),
    showStagedFile: (cwd: string, filePath: string): Promise<unknown> =>
      ipcRenderer.invoke('git:show-staged-file', cwd, filePath),
    stage: (cwd: string, filePaths: string[]): Promise<unknown> => ipcRenderer.invoke('git:stage', cwd, filePaths),
    unstage: (cwd: string, filePaths: string[]): Promise<unknown> => ipcRenderer.invoke('git:unstage', cwd, filePaths),
    stageAll: (cwd: string): Promise<unknown> => ipcRenderer.invoke('git:stage-all', cwd),
    unstageAll: (cwd: string): Promise<unknown> => ipcRenderer.invoke('git:unstage-all', cwd),
    discard: (cwd: string, filePaths: string[]): Promise<unknown> => ipcRenderer.invoke('git:discard', cwd, filePaths),
    discardAll: (cwd: string): Promise<unknown> => ipcRenderer.invoke('git:discard-all', cwd),
    commit: (cwd: string, message: string, amend?: boolean): Promise<unknown> =>
      ipcRenderer.invoke('git:commit', cwd, message, amend),
    push: (cwd: string): Promise<unknown> => ipcRenderer.invoke('git:push', cwd),
    pull: (cwd: string): Promise<unknown> => ipcRenderer.invoke('git:pull', cwd),
    stash: (cwd: string, message?: string): Promise<unknown> => ipcRenderer.invoke('git:stash', cwd, message),
    stashPop: (cwd: string): Promise<unknown> => ipcRenderer.invoke('git:stash-pop', cwd),
    log: (cwd: string, count?: number): Promise<unknown> => ipcRenderer.invoke('git:log', cwd, count)
  },
  fs: {
    openFolder: (): Promise<unknown> => ipcRenderer.invoke('fs:open-folder'),
    readDir: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:read-dir', path),
    readDirRecursive: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:read-dir-recursive', path),
    readFile: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:read-file', path),
    writeFile: (path: string, content: string): Promise<unknown> => ipcRenderer.invoke('fs:write-file', path, content),
    getRecentFolders: (): Promise<unknown> => ipcRenderer.invoke('fs:get-recent-folders'),
    openRecent: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:open-recent', path),
    getGitInfo: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:get-git-info', path),
    pickFiles: (): Promise<unknown> => ipcRenderer.invoke('fs:pick-files'),
    readFileDataUrl: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:read-file-data-url', path),
    onOpenFolder: (callback: (path: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, path: string): void => callback(path)
      ipcRenderer.on('menu:open-folder', listener)
      return () => ipcRenderer.removeListener('menu:open-folder', listener)
    },
    onCloseTab: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('menu:close-tab', listener)
      return () => ipcRenderer.removeListener('menu:close-tab', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
