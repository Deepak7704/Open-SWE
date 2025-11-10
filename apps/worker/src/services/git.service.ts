/**
 * Git Service
 *
 * Handles all Git-related operations:
 * - Git installation in sandbox
 * - Repository cloning
 * - Branching, committing, and pushing
 *
 * Extracted from sandbox_executor.ts lines 24-87 and worker.ts lines 141-150
 */

import { Sandbox } from '@e2b/code-interpreter';

export class GitService {
  private gitInstalled = false;

  /**
   * Ensure git is installed in the sandbox
   * Extracted from sandbox_executor.ts lines 24-60
   */
  private async ensureGitInstalled(sandbox: Sandbox): Promise<void> {
    if (this.gitInstalled) {
      console.log('Git already installed');
      return;
    }

    console.log('Checking for git...');
    const check = await sandbox.commands.run('git --version', { timeoutMs: 15000 });

    if (check.exitCode === 0) {
      console.log('Git already available');
      this.gitInstalled = true;
      return;
    }

    console.log('Installing git locally (no sudo)...');
    const installCommand = `
            cd /home/user && \
            wget https://mirrors.edge.kernel.org/pub/software/scm/git/git-2.44.0.tar.gz && \
            tar -xzf git-2.44.0.tar.gz && \
            cd git-2.44.0 && \
            make prefix=/home/user/local all && \
            make prefix=/home/user/local install && \
            export PATH=/home/user/local/bin:$PATH && \
            git --version
        `;

    const result = await sandbox.commands.run(installCommand, { timeoutMs: 600000 });

    if (result.exitCode !== 0) {
      console.error(result.stderr);
      throw new Error("Failed to install git locally.");
    }

    console.log('Git installed successfully!');
    this.gitInstalled = true;
  }

  /**
   * Clone repository into the sandbox
   * Extracted from sandbox_executor.ts lines 66-87
   */
  async cloneRepository(sandbox: Sandbox, repoUrl: string): Promise<string> {
    await this.ensureGitInstalled(sandbox);
    console.log(`Cloning: ${repoUrl}`);

    const targetDir = '/home/user/project';
    await sandbox.commands.run(`rm -rf ${targetDir}`);

    const cloneCmd = `
            export PATH=/home/user/local/bin:$PATH && \
            git clone ${repoUrl} ${targetDir}
        `;

    const result = await sandbox.commands.run(cloneCmd, { timeoutMs: 300000 });

    if (result.exitCode !== 0) {
      console.error(result.stderr);
      throw new Error('Failed to clone repository.');
    }

    console.log('Repository cloned successfully!');
    return targetDir;
  }

  /**
   * Configure git, create branch, commit changes, and push to fork
   * Extracted from worker.ts lines 141-150
   */
  async commitAndPush(
    sandbox: Sandbox,
    repoPath: string,
    branchName: string,
    commitMessage: string,
    forkUrl: string,
    githubToken: string
  ): Promise<void> {
    // Configure git user
    await sandbox.commands.run(`cd ${repoPath} && git config user.email "bot@example.com"`);
    await sandbox.commands.run(`cd ${repoPath} && git config user.name "AI Bot"`);

    // Create and checkout new branch
    await sandbox.commands.run(`cd ${repoPath} && git checkout -b ${branchName}`);

    // Stage and commit changes
    await sandbox.commands.run(`cd ${repoPath} && git add .`);
    await sandbox.commands.run(`cd ${repoPath} && git commit -m "${commitMessage}"`);

    // Push to fork with authentication
    const authenticatedForkUrl = forkUrl.replace('https://github.com', `https://${githubToken}@github.com`);
    await sandbox.commands.run(`cd ${repoPath} && git push ${authenticatedForkUrl} ${branchName}`);
  }
}
