"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { GitHubRepo } from "@/types";

export default function Dashboard() {
  const { user, token, logout, isLoading } = useAuth();
  const router = useRouter();

  // State management
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [task, setTask] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [loadingRepos, setLoadingRepos] = useState(true);

  // Debug: Track component renders
  useEffect(() => {
    console.log('[Dashboard] Component rendered at:', new Date().toISOString());
    console.log('[Dashboard] User:', user?.username || 'Not logged in');
    console.log('[Dashboard] Token exists:', !!token);
    console.log('[Dashboard] Loading:', isLoading);
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  // Memoize fetchRepositories to prevent unnecessary re-creation
  // This ensures the function reference stays stable unless token changes
  const fetchRepositories = useCallback(async () => {
    if (!token) return; // Early return if no token

    try {
      setLoadingRepos(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

      console.log('[Dashboard] Fetching repositories...');

      const response = await fetch(`${backendUrl}/auth/repos`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch repositories');
      }

      const data = await response.json();
      console.log(`[Dashboard] Fetched ${data.repos.length} repositories`);

      setRepos(data.repos);
      setFilteredRepos(data.repos);
    } catch (error) {
      console.error('[Dashboard] Error fetching repos:', error);
      alert('Failed to fetch repositories. Please try again.');
    } finally {
      setLoadingRepos(false);
    }
  }, [token]); // Only recreate if token changes

  // Fetch repositories on mount
  // Now safe to include fetchRepositories in dependency array
  useEffect(() => {
    if (user && token) {
      console.log('[Dashboard] Triggering repository fetch');
      fetchRepositories();
    }
  }, [user, token, fetchRepositories]);

  // Filter repositories based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredRepos(repos);
    } else {
      const filtered = repos.filter(repo =>
        repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredRepos(filtered);
    }
  }, [searchQuery, repos]);

  const handleRepoSelect = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setSearchQuery(repo.full_name);
    setShowDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRepo || !task.trim()) {
      alert('Please select a repository and describe your task');
      return;
    }

    setIsSubmitting(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          repoUrl: selectedRepo.html_url,
          task: task,
        }),
      });

      const data = await response.json();
      setJobStatus(data);
      console.log('Job submitted:', data);

      setTask("");

      setTimeout(() => {
        router.push(`/chat?jobId=${data.jobId}`);
      }, 1500);
    } catch (error) {
      console.error('Error submitting task:', error);
      alert('Failed to submit task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle keyboard shortcut (Cmd+Enter or Ctrl+Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  if (isLoading || loadingRepos) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mb-4"></div>
          <p className="text-foreground">
            {isLoading ? 'Loading...' : 'Fetching repositories...'}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background border-b border-foreground px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">
              100xSWE <span className="text-muted-foreground">@</span> <span className="font-semibold">github</span>
            </h1>
            {selectedRepo && (
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-foreground">{selectedRepo.full_name}</span>
                <span className="px-2 py-0.5 bg-muted text-foreground rounded text-xs">
                  {selectedRepo.defaultBranch || 'master'}
                </span>
                <span className="text-muted-foreground">$</span>
              </div>
            )}
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{user.name || user.username}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <img
              src={user.avatar}
              alt={user.username}
              className="w-10 h-10 rounded-full border-2 border-foreground"
            />
            <button
              onClick={logout}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-foreground border border-foreground rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-background rounded-xl shadow-sm border border-foreground p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Repository Selector */}
            <div className="relative">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search repositories..."
                  className="text-foreground w-full pl-10 pr-4 py-3 border border-foreground rounded-lg focus:ring-2 focus:ring-foreground focus:border-transparent outline-none bg-background"
                />
              </div>

              {/* Dropdown */}
              {showDropdown && filteredRepos.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-background border border-foreground rounded-lg shadow-lg max-h-80 overflow-y-auto">
                  {filteredRepos.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => handleRepoSelect(repo)}
                      className="w-full px-4 py-3 text-left hover:bg-muted border-b border-border last:border-b-0 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{repo.full_name}</p>
                          {repo.description && (
                            <p className="text-sm text-muted-foreground truncate mt-0.5">{repo.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {repo.language && (
                            <span className="px-2 py-0.5 text-xs bg-muted text-foreground border border-foreground rounded">
                              {repo.language}
                            </span>
                          )}
                          {repo.private && (
                            <span className="px-2 py-0.5 text-xs bg-foreground text-background rounded">
                              Private
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && filteredRepos.length === 0 && searchQuery && (
                <div className="absolute z-10 w-full mt-2 bg-background border border-foreground rounded-lg shadow-lg p-4">
                  <p className="text-muted-foreground text-center text-sm">No repositories match your search</p>
                </div>
              )}

              {/* Show message if no repos at all */}
              {!loadingRepos && repos.length === 0 && !searchQuery && (
                <div className="mt-4 bg-muted border border-foreground rounded-lg p-6">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-foreground flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-2">No Repositories Found</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        To use 100xSWE, you need to install the GitHub App on your repositories.
                      </p>
                      <button
                        onClick={() => {
                          window.location.href = 'https://github.com/apps/100xSWE/installations/new';
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-foreground border border-foreground font-medium rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Install GitHub App
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Click outside to close dropdown */}
              {showDropdown && (
                <div
                  className="fixed inset-0 z-0"
                  onClick={() => setShowDropdown(false)}
                />
              )}
            </div>

            {/* Task Description */}
            <div>
              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your task..."
                rows={8}
                className="text-foreground w-full px-4 py-3 border border-foreground rounded-lg focus:ring-2 focus:ring-foreground focus:border-transparent resize-none outline-none bg-background"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Press <kbd className="px-2 py-0.5 bg-muted border border-foreground rounded text-xs">Cmd+Enter</kbd> to submit
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!selectedRepo || !task.trim() || isSubmitting}
              className="w-full bg-primary text-primary-foreground hover:bg-foreground border border-foreground font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Code...
                </span>
              ) : (
                'Generate Code'
              )}
            </button>
          </form>
        </div>

        {/* Job Status Display */}
        {jobStatus && (
          <div className="mt-6 p-6 bg-muted border border-foreground rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-foreground flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-2">Task Submitted Successfully</h3>
                <div className="text-sm text-foreground space-y-1">
                  <p><strong>Job ID:</strong> {jobStatus.jobId || jobStatus.codeGenJobId}</p>
                  <p><strong>Repository:</strong> {jobStatus.repoId}</p>
                  <p><strong>Status:</strong> {jobStatus.message}</p>
                  {jobStatus.indexing && (
                    <div className="mt-2 p-2 bg-secondary border border-foreground rounded">
                      <p className="text-foreground flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Repository indexing in progress...
                      </p>
                    </div>
                  )}
                  {jobStatus.estimatedTime && (
                    <p className="text-sm"><strong>Estimated Time:</strong> {jobStatus.estimatedTime}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Features Info */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-background rounded-lg shadow-sm border border-foreground p-6 text-center">
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="font-semibold text-foreground mb-1">AI-Powered</h3>
            <p className="text-sm text-muted-foreground">Smart code generation using Gemini AI</p>
          </div>
          <div className="bg-background rounded-lg shadow-sm border border-foreground p-6 text-center">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="font-semibold text-foreground mb-1">Fast Indexing</h3>
            <p className="text-sm text-muted-foreground">Automatic repository indexing on push</p>
          </div>
          <div className="bg-background rounded-lg shadow-sm border border-foreground p-6 text-center">
            <div className="text-3xl mb-3">🔍</div>
            <h3 className="font-semibold text-foreground mb-1">Smart Search</h3>
            <p className="text-sm text-muted-foreground">BM25-powered semantic code search</p>
          </div>
        </div>
      </main>
    </div>
  );
}
