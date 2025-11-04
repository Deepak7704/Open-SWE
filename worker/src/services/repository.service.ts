import { ChunkingService } from './chunking.service';
import { SandboxService } from './sandbox.service';
import { GitService } from './git.service';
import type { CodeChunk } from './chunking.service';
import type { Sandbox } from '@e2b/code-interpreter';

export class RepositoryIndexer {
  private chunkingService: ChunkingService;
  private sandboxService: SandboxService;
  private gitService: GitService;

  constructor() {
    this.chunkingService = new ChunkingService();
    this.sandboxService = new SandboxService();
    this.gitService = new GitService();
  }

  async indexRepository(
    projectId: string,
    repoUrl: string,
    branch: string = 'main'
  ): Promise<CodeChunk[]> {
    console.log('='.repeat(70));
    console.log('INDEXING REPOSITORY');
    console.log('='.repeat(70));
    console.log(`Project: ${projectId}`);
    console.log(`Repository: ${repoUrl}`);
    console.log(`Branch: ${branch}\n`);

    const sandbox = await this.sandboxService.getOrCreateSandbox(projectId);
    console.log('Sandbox ready\n');

    try {
      console.log('Cloning repository...');
      const repoPath = await this.gitService.cloneRepository(sandbox, repoUrl);
      console.log(`Repository cloned to ${repoPath}\n`);

      console.log('Scanning for code files...');
      const codeFiles = await this.getCodeFilesFromSandbox(sandbox, repoPath);
      console.log(`Found ${codeFiles.length} code files\n`);

      if (codeFiles.length === 0) {
        console.warn('No code files found in repository');
        return [];
      }

      console.log('Processing files...\n');
      const allChunks: CodeChunk[] = [];
      let successCount = 0;
      let failureCount = 0;

      for (const file of codeFiles) {
        try {
          const fileContent = await sandbox.files.read(file.path);

          console.log(`Processing: ${file.relativePath}`);
          console.log(`Lines: ${fileContent.split('\n').length}`);

          const chunks = this.chunkingService.chunkFile(
            fileContent,
            file.relativePath,
            file.extension
          );

          allChunks.push(...chunks);
          console.log(`Chunks: ${chunks.length}`);

          successCount++;

        } catch (error) {
          console.error(
            `Failed to process ${file.path}:`,
            error instanceof Error ? error.message : String(error)
          );
          failureCount++;
        }
      }

      console.log('='.repeat(70));
      console.log('INDEXING COMPLETE');
      console.log('='.repeat(70));
      console.log(`Files processed: ${successCount}/${codeFiles.length}`);
      console.log(`Files failed: ${failureCount}`);
      console.log(`Total chunks created: ${allChunks.length}`);
      console.log('='.repeat(70) + '\n');

      return allChunks;

    } catch (error) {
      console.error('Indexing failed:', error);
      throw error;

    } finally {
      console.log('Cleaning up sandbox...');
      await this.sandboxService.cleanup(projectId);
      console.log('Sandbox cleaned up\n');
    }
  }

  private async getCodeFilesFromSandbox(
    sandbox: Sandbox,
    repoPath: string
  ): Promise<
    Array<{
      path: string;
      relativePath: string;
      extension: string;
    }>
  > {
    console.log('Include: .ts, .js, .tsx, .jsx');
    console.log('Exclude: node_modules/, .git/, dist/, build/\n');

    const result = await sandbox.commands.run(`
      find ${repoPath} -type f \\
        \\( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \\) \\
        ! -path "*/node_modules/*" \\
        ! -path "*/.git/*" \\
        ! -path "*/dist/*" \\
        ! -path "*/build/*" \\
        ! -path "*/.next/*" \\
        ! -path "*/coverage/*"
    `);

    const files = result.stdout
      .split('\n')
      .filter((filePath: string) => filePath.trim() !== '')
      .map((filePath: string) => ({
        path: filePath.trim(),
        relativePath: filePath.replace(`${repoPath}/`, ''),
        extension: filePath.substring(filePath.lastIndexOf('.'))
      }));

    return files;
  }

  async getFileTree(projectId: string, dir?: string): Promise<string[]> {
    const sandbox = await this.sandboxService.getOrCreateSandbox(projectId);
    return await this.sandboxService.getFileTree(sandbox, dir);
  }

  async getFileContents(
    projectId: string,
    filePaths: string[],
    maxLines?: number
  ): Promise<Map<string, string>> {
    const sandbox = await this.sandboxService.getOrCreateSandbox(projectId);
    return await this.sandboxService.getFileContents(sandbox, filePaths, maxLines);
  }
}
