/**
 * Job Processor
 *
 * Orchestrates the entire code change workflow by coordinating all services.
 * Main entry point for processing background jobs.
 *
 * Uses Hybrid Search (BM25 + Vector) to find relevant files.
 **/

import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { GitHubService } from '../services/github.service';
import { GitService } from '../services/git.service';
import { SandboxService } from '../services/sandbox.service';
import { AIService } from '../services/ai.service';
import { generateBranchName, extractKeywords } from '../utils/helpers';
import { EnhancedCodeGraphService } from '../services/code_graph.service';
import { CodeSkeletonService } from '../services/code_skeleton';
import { createCodeValidationGraph } from '../workflows/code_validation';

export class JobProcessor {
  private redis: Redis;
  private gitService: GitService;
  private sandboxService: SandboxService;
  private aiService: AIService;
  private indexingQueue: Queue;

  constructor(redis: Redis) {
    this.redis = redis;
    this.gitService = new GitService();
    this.sandboxService = new SandboxService();
    this.aiService = new AIService();
    this.indexingQueue = new Queue('indexing', { connection: redis });
  }

  /**
   * Process a code change job
   * Main workflow orchestration
   */
  async process(job: any): Promise<{
    success: boolean;
    prUrl: string;
    prNumber: number;
    fileDiffs: Array<{ path: string; oldContent: string; newContent: string; diffOutput: string }>;
    fileOperations: any[];
    explanation: string;
  }> {
    const { repoUrl, task, repoId, indexingJobId, installationToken } = job.data;
    const projectId = `job-${job.id}`;

    console.log(`Processing job ${job.id}: ${task}`);
    console.log(`Repository ID: ${repoId}`);

    // Get GitHub token (installation token from job data or fallback to env)
    const githubToken = installationToken || process.env.GITHUB_ACCESS_TOKEN;
    if (!githubToken) {
      throw new Error('No GitHub token available (neither installationToken nor GITHUB_ACCESS_TOKEN)');
    }

    // Create GitHubService with this job's token
    const githubService = new GitHubService(githubToken);
    console.log(`Using ${installationToken ? 'installation' : 'personal'} token for GitHub operations`);

    try {
      // If indexingJobId is provided, wait for indexing to complete first
      if (indexingJobId) {
        console.log(`Waiting for indexing job ${indexingJobId} to complete...`);
        await this.waitForIndexing(indexingJobId);
        console.log(`Indexing complete! Proceeding with code generation...`);
      }
      // Step 1: Create or get sandbox
      await job.updateProgress(10);
      console.log('Step 1: Creating sandbox...');
      const sandbox = await this.sandboxService.getOrCreateSandbox(projectId);

      // Step 2: Clone repository directly (no forking needed for GitHub Apps)
      await job.updateProgress(20);
      console.log('Step 2: Cloning repository directly...');
      const repoPath = await this.gitService.cloneRepository(sandbox, repoUrl);

      // Step 3.5: Detect package manager
      console.log('Step 3.5: Detecting package manager...');
      const packageManager = await this.sandboxService.detectPackageManager(sandbox, repoPath);
      console.log(`Detected package manager: ${packageManager}\n`);

      // Step 4: Find relevant files using Hybrid Search (BM25 + Vector)
      await job.updateProgress(40);
      console.log('Step 4: Finding relevant files using Hybrid Search...');
      const relevantFiles = await this.aiService.findRelevantFilesHybrid(
        this.redis,
        repoId,
        task,
        20  // top 20 relevant files
      );

      if (relevantFiles.length === 0) {
        throw new Error('No relevant files found. Repository may not be indexed yet.');
      }

      console.log('Step 4.5:Building the code graph and code skeletons for candidate files');
      const graphService = new EnhancedCodeGraphService();
      const codeSkeletonService = new CodeSkeletonService();

      const candidateContents = await this.sandboxService.getFileContents(sandbox,relevantFiles,Infinity,repoPath);
      //Build code graph
      const codeGraph = graphService.buildGraph(candidateContents);
      console.log(`code graph build for the above candidate files ${codeGraph.nodes.size} nodes extracted`);


      const skeletons = new Map<string,string>();
      relevantFiles.forEach(filePath => {
        const skeleton = codeSkeletonService.generateSkeleton(codeGraph,filePath);
        const formatted = codeSkeletonService.formatSkeletonForLLM(skeleton);
        skeletons.set(filePath,formatted);
      })
      console.log(`Generated ${skeletons.size} code skeletons for llm analysis`);

      // Step 5: Select files to modify using LLM (with fallback to hybrid search ranking)
      console.log('Step 5: Selecting files to modify...');
      const keywords = extractKeywords(task);
      let filesToModify = await this.aiService.selectFilesToModifyWithSkeletons(task,skeletons,repoPath);

      // FALLBACK: If LLM selected 0 files, use top-ranked files from hybrid search
      if (filesToModify.length === 0) {
        console.warn('\nFALLBACK TRIGGERED: LLM selected 0 files');
        console.warn('Using top-ranked files from hybrid search results instead...\n');

        // Take top 3-5 files from relevantFiles (already ranked by hybrid search)
        const topN = Math.min(5, relevantFiles.length);
        filesToModify = relevantFiles.slice(0, topN);

        console.log(`Fallback selected top ${filesToModify.length} files from hybrid search:`);
        filesToModify.forEach((file, idx) => {
          console.log(`  ${idx + 1}. ${file}`);
        });
        console.log('');
      }

      // Step 6: Read file contents and get project structure
      await job.updateProgress(60);
      console.log('Step 6: Reading file contents (full files, no line limit)...');
      const fileContents = await this.sandboxService.getFileContents(sandbox, filesToModify, Infinity, repoPath);
      const allFiles = await this.sandboxService.getFileTree(sandbox, repoPath);

      // Step 7: Use LangGraph workflow for code generation + validation loop
      await job.updateProgress(70);
      console.log('\nStarting LangGraph Code Generation + Validation Workflow');

      const branchName = generateBranchName(task);
      const graph = createCodeValidationGraph();

      const workflowResult = await graph.invoke({
        repoUrl,
        repoId,
        task,
        forkUrl: repoUrl,
        forkOwner: repoId.split('/')[0],
        branchName,
        packageManager,
        relevantFiles,
        filesToModify,
        fileContents,
        allFiles,
        keywords,
        codeSkeletons: skeletons,
        sandbox,
        repoPath,
        projectId,
        githubToken,
        currentIteration: 0,
        maxIterations: 3,
        validationErrors: [],
        typeErrors: [],
        syntaxErrors: [],
        allValidationsPassed: false,
        status: "generating" as const,
        generatedCode: null,
        prUrl: null,
        prNumber: null,
        errorMessage: null
      });

      console.log('\nLangGraph Workflow Completed');
      console.log(`Final Status: ${workflowResult.status}`);
      console.log(`Iterations: ${workflowResult.currentIteration}/${workflowResult.maxIterations}`);
      console.log(`Validations Passed: ${workflowResult.allValidationsPassed}`);

      if (workflowResult.status !== "success" || !workflowResult.prUrl) {
        const errorMsg = workflowResult.errorMessage || 'Workflow failed to generate valid code';
        console.error(`\nWorkflow failed: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`\nPR Created: ${workflowResult.prUrl}`);
      console.log(`PR Number: #${workflowResult.prNumber}`);

      // Step 8: Get file diffs for frontend display
      console.log('\nGenerating file diffs for frontend...');
      const fileDiffs = await this.getFileDiffs(
        sandbox,
        repoPath,
        workflowResult.generatedCode?.fileOperations || []
      );
      console.log(`Generated diffs for ${fileDiffs.length} files`);

      // Step 9: Mark as complete (sandbox will auto-cleanup after 30min timeout)
      await job.updateProgress(100);
      console.log('\nSandbox will remain active for 30 minutes for frontend display');

      console.log(`\nJob ${job.id} completed successfully!`);

      return {
        success: true,
        prUrl: workflowResult.prUrl,
        prNumber: workflowResult.prNumber!,
        fileDiffs,
        fileOperations: workflowResult.generatedCode?.fileOperations || [],
        explanation: workflowResult.generatedCode?.explanation || ''
      };

    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      await this.sandboxService.cleanup(projectId);
      throw error;
    }
  }

  /**
   * Get file diffs for modified files
   */
  private async getFileDiffs(
    sandbox: any,
    repoPath: string,
    fileOperations: any[]
  ): Promise<Array<{ path: string; oldContent: string; newContent: string; diffOutput: string }>> {
    const diffs: Array<{ path: string; oldContent: string; newContent: string; diffOutput: string }> = [];

    // Files to exclude from diff display (lock files and large dependency files)
    const excludePatterns = [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Cargo.lock',
      'Gemfile.lock',
      'composer.lock',
      'poetry.lock',
      'Pipfile.lock',
      'go.sum',
      'mix.lock',
      'pubspec.lock',
      '.lock'
    ];

    const shouldExcludeFile = (filePath: string): boolean => {
      return excludePatterns.some(pattern =>
        filePath.endsWith(pattern) || filePath.includes(`/${pattern}`)
      );
    };

    for (const op of fileOperations) {
      try {
        // Skip excluded files
        if (shouldExcludeFile(op.path)) {
          console.log(`Skipping excluded file: ${op.path}`);
          continue;
        }

        const filePath = `${repoPath}/${op.path}`;

        // Get current content (after changes)
        let newContent = '';
        try {
          const readResult = await sandbox.files.read(filePath);
          newContent = readResult || '';
        } catch (error) {
          // File might not exist (deleted or failed to create)
          newContent = '';
        }

        // Get old content from git (before changes)
        let oldContent = '';
        try {
          const gitShowResult = await sandbox.commands.run(`cd ${repoPath} && git show HEAD:${op.path}`);
          oldContent = gitShowResult.stdout || '';
        } catch (error) {
          // File didn't exist before (new file)
          oldContent = '';
        }

        // Generate git diff output - compare against the default branch
        let diffOutput = '';
        try {
          // Detect the default branch name
          let baseBranch = 'main';
          try {
            const branchListResult = await sandbox.commands.run(
              `cd ${repoPath} && git branch -r`
            );
            const remoteBranches = branchListResult.stdout || '';
            if (remoteBranches.includes('origin/master') && !remoteBranches.includes('origin/main')) {
              baseBranch = 'master';
            }
          } catch (e) {
            console.warn('Failed to detect default branch, using main');
          }

          console.log(`Generating diff for ${op.path} against origin/${baseBranch}...`);

          // Generate diff against the base branch
          const gitDiffResult = await sandbox.commands.run(
            `cd ${repoPath} && git diff origin/${baseBranch}...HEAD -- ${op.path}`
          );
          diffOutput = gitDiffResult.stdout || '';

          // If no diff output (new file or deleted file), generate manual diff
          if (!diffOutput) {
            if (!oldContent && newContent) {
              // New file
              const lines = newContent.split('\n');
              diffOutput = `diff --git a/${op.path} b/${op.path}\n`;
              diffOutput += `new file mode 100644\n`;
              diffOutput += `--- /dev/null\n`;
              diffOutput += `+++ b/${op.path}\n`;
              diffOutput += `@@ -0,0 +1,${lines.length} @@\n`;
              diffOutput += lines.map(line => `+${line}`).join('\n');
            } else if (oldContent && !newContent) {
              // Deleted file
              const lines = oldContent.split('\n');
              diffOutput = `diff --git a/${op.path} b/${op.path}\n`;
              diffOutput += `deleted file mode 100644\n`;
              diffOutput += `--- a/${op.path}\n`;
              diffOutput += `+++ /dev/null\n`;
              diffOutput += `@@ -1,${lines.length} +0,0 @@\n`;
              diffOutput += lines.map(line => `-${line}`).join('\n');
            }
          }
        } catch (error) {
          console.warn(`Failed to generate git diff for ${op.path}:`, error);
          diffOutput = '';
        }

        diffs.push({
          path: op.path,
          oldContent,
          newContent,
          diffOutput
        });
      } catch (error) {
        console.warn(`Failed to get diff for ${op.path}:`, error);
        // Add empty diff to maintain file list
        diffs.push({
          path: op.path,
          oldContent: '',
          newContent: '',
          diffOutput: ''
        });
      }
    }

    return diffs;
  }

  /**
   * Wait for indexing job to complete before proceeding
   */
  private async waitForIndexing(indexingJobId: string): Promise<void> {
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes max
    const pollInterval = 5000; // Check every 5 seconds
    const startTime = Date.now();

    console.log(`Waiting for indexing job ${indexingJobId}...`);

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const indexingJob = await this.indexingQueue.getJob(indexingJobId);

        if (!indexingJob) {
          throw new Error(`Indexing job ${indexingJobId} not found`);
        }

        const state = await indexingJob.getState();
        const progress = indexingJob.progress || 0;

        console.log(`Indexing status: ${state} (${progress}%)`);

        if (state === 'completed') {
          console.log(`Indexing completed successfully!`);
          return;
        }

        if (state === 'failed') {
          const reason = indexingJob.failedReason || 'Unknown error';
          throw new Error(`Indexing failed: ${reason}`);
        }

        // Still running, wait and check again
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        console.error(`Error checking indexing status:`, error);
        throw error;
      }
    }

    throw new Error(`Indexing timeout: Job ${indexingJobId} took longer than ${maxWaitTime / 1000 / 60} minutes`);
  }
}
