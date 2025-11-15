// User type - matches what backend returns from GitHub OAuth
export interface User {
  id: number;
  username: string;
  email: string;
  name: string | null;
  avatar: string;
  profileUrl: string;
}

// GitHub Repository type - matches GitHub API response
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  fork?: boolean;
  language: string | null;
  stargazers_count?: number;
  updated_at: string;
  defaultBranch?: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

// Job status from backend /api/status endpoint
export interface Job {
  jobId: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  result?: any;
}

// Response from /api/chat endpoint
export interface ChatResponse {
  message: string;
  indexing: boolean;
  jobId?: string;
  indexingJobId?: string;
  repoId: string;
  statusUrl: string;
  indexingStatusUrl?: string;
  estimatedTime?: string;
}
