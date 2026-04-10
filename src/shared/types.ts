export interface GitHubUser {
  login: string
  avatar_url: string
  name: string | null
  id: number
}

export interface GitHubRepo {
  name: string
  full_name: string
  description: string | null
  html_url: string
  owner: {
    login: string
    avatar_url: string
  }
}

export interface AuthData {
  token: string
  scopes: string[]
  user: GitHubUser
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface GitRepoInfo {
  owner: string
  repo: string
}

export interface PullRequest {
  number: number
  title: string
  state: string
  html_url: string
  created_at: string
  user: {
    login: string
    avatar_url: string
  }
}
