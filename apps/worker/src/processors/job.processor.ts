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
  async process(job: any): Promise<{ success: boolean; prUrl: string; prNumber: number }> {
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
      // Step 1: Ensure fork exists
      await job.updateProgress(10);
      console.log('Step 1: Ensuring fork exists...');
      const { forkUrl, forkOwner } = await githubService.ensureFork(repoUrl);

      // Step 2: Create or get sandbox
      await job.updateProgress(20);
      console.log('Step 2: Creating sandbox...');
      const sandbox = await this.sandboxService.getOrCreateSandbox(projectId);

      // Step 3: Clone repository
      await job.updateProgress(30);
      console.log('Step 3: Cloning repository...');
      const repoPath = await this.gitService.cloneRepository(sandbox, forkUrl);

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

      // Step 7: Generate code changes using AI
      await job.updateProgress(70);
      console.log('Step 7: Generating code changes...');
      const generation = await this.aiService.generateCodeChanges(
        repoUrl,
        task,
        fileContents,
        relevantFiles,
        allFiles,
        keywords,
        packageManager  // ← Pass package manager to AI
      );

      // Step 8: Execute file operations
      await job.updateProgress(80);
      console.log('Step 8: Executing file operations...');
      await this.sandboxService.executeFileOperations(sandbox, generation.fileOperations, repoPath);

      // Step 9: Run shell commands if needed
      if (generation.shellCommands && generation.shellCommands.length > 0) {
        console.log('Step 9: Running shell commands...');
        await this.sandboxService.runShellCommands(sandbox, generation.shellCommands, repoPath, packageManager);
      }

      // Step 10: Create branch, commit, and push
      await job.updateProgress(90);
      console.log('Step 10: Committing and pushing changes...');
      const branchName = generateBranchName();
      await this.gitService.commitAndPush(
        sandbox,
        repoPath,
        branchName,
        `feat: ${task}`,
        forkUrl,
        githubToken
      );

      // Step 11: Create pull request
      console.log('Step 11: Creating pull request...');
      const pr = await githubService.createPullRequest(
        repoUrl,
        forkOwner,
        branchName,
        task,
        generation.explanation
      );

      // Step 12: Cleanup
      await job.updateProgress(100);
      console.log('Step 12: Cleaning up...');
      await this.sandboxService.cleanup(projectId);

      console.log(`Job ${job.id} completed. PR: ${pr.url}`);

      return {
        success: true,
        prUrl: pr.url,
        prNumber: pr.number
      };

    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      await this.sandboxService.cleanup(projectId);
      throw error;
    }
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
