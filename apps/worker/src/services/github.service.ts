/**
 * GitHub Service
 *
 * Handles all GitHub-related operations:
 * - Repository forking
 * - Pull request creation
 *
 * Extracted from worker.ts lines 33-53, 152
 */

import { GitHubHelper } from '../lib/github_helper';

export class GitHubService {
  private githubHelper: GitHubHelper;

  constructor(githubToken: string) {
    this.githubHelper = new GitHubHelper(githubToken);
  }

  /**
   * Ensure fork exists, create if necessary
   * Extracted from worker.ts lines 33-53
   */
  async ensureFork(repoUrl: string): Promise<{ forkUrl: string; forkOwner: string }> {
    const { owner, repo } = this.githubHelper.parseGitHubUrl(repoUrl);
    const user = await this.githubHelper.getAuthenticatedUser();
    let forkInfo = await this.githubHelper.getFork(owner, repo);

    if (!forkInfo.exists) {
      const newFork = await this.githubHelper.forkRepository(owner, repo);
      return {
        forkUrl: newFork.cloneUrl,
        forkOwner: newFork.forkOwner
      };
    }

    return {
      forkUrl: forkInfo.cloneUrl!,
      forkOwner: forkInfo.forkOwner!
    };
  }

  /**
   * Create pull request from fork to original repository
   * Extracted from worker.ts line 152
   */
  async createPullRequest(
    repoUrl: string,
    forkOwner: string,
    branchName: string,
    task: string,
    explanation: string
  ): Promise<{ number: number; url: string }> {
    const { owner: originalOwner, repo: originalRepo } = this.githubHelper.parseGitHubUrl(repoUrl);

    return await this.githubHelper.createPullRequest(
      originalOwner,
      originalRepo,
      forkOwner,
      branchName,
      `AI: ${task}`,
      explanation
    );
  }
}
