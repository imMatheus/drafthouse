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
}

export interface AuthData {
  token: string
  user: GitHubUser
}
