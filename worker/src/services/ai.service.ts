/**
 * AI Service
 *
 * Handles all AI-related operations:
 * - File discovery using LangGraph
 * - LLM-based file selection
 * - AI code generation
 * - Prompt building
 *
 * Extracted from worker.ts lines 70-120, 173-251
 * and sandbox_executor.ts lines 93-129, 170-238
 */

import { Sandbox } from '@e2b/code-interpreter';
import { generateObject, generateText } from 'ai';
import Redis from 'ioredis';
import gemini from '../lib/ai_config';
import { GenerationSchema, type GenerateOutput } from '../types';
import { createFileSearchGraph } from '../workflows/file_search';
import { extractKeywords } from '../utils/helpers';
import { HybridSearchService } from './hybrid-search.service';

export class AIService {
  /**
   * Find relevant files using LangGraph workflow
   * Extracted from worker.ts lines 70-86
   */
  async findRelevantFiles(
    sandbox: Sandbox,
    repoPath: string,
    userPrompt: string
  ): Promise<string[]> {
    console.log('Finding relevant files using LangGraph');
    const searchGraph = createFileSearchGraph();

    const searchResult = await searchGraph.invoke({
      userPrompt: userPrompt,
      sandbox: sandbox,
      repoDirectoryPath: repoPath,
      foundfiles: [],
      selectedTool: "grep",
      searchQuery: ""
    });

    const relevantFiles = searchResult.foundfiles;
    console.log(`Found ${relevantFiles.length} relevant files via LangGraph`);

    return relevantFiles;
  }

  /**
   * Find relevant files using Hybrid Search (BM25 + Vector)
   * More accurate than LangGraph for pre-indexed repositories
   */
  async findRelevantFilesHybrid(
    redis: Redis,
    repoId: string,
    userPrompt: string,
    topK: number = 20
  ): Promise<string[]> {
    console.log('Finding relevant files using Hybrid Search (BM25 + Vector)');

    // Initialize hybrid search service
    const hybridSearch = new HybridSearchService(redis, repoId);
    await hybridSearch.initialize();

    // Search using both BM25 and Vector similarity
    const results = await hybridSearch.search(userPrompt, topK, 'rrf');

    // Get unique file paths
    const relevantFiles = hybridSearch.getUniqueFiles(results);

    console.log(`Found ${relevantFiles.length} relevant files via Hybrid Search`);

    // Also show grouped results for transparency
    const grouped = hybridSearch.groupByFile(results);
    console.log('\nRelevant chunks per file:');
    grouped.forEach((chunks, filePath) => {
      console.log(`  ${filePath}: ${chunks.length} chunk(s)`);
    });
    console.log('');

    return relevantFiles;
  }

  /**
   * Search files by content using grep
   * Extracted from sandbox_executor.ts lines 93-129
   */
  async searchFilesByContent(
    sandbox: Sandbox,
    keywords: string[],
    directory: string = '/home/user/project'
  ): Promise<string[]> {
    console.log(`\nSearching for keywords: ${keywords.join(', ')}`);

    const pattern = keywords.join('\\|');
    const grepCmd = `grep -rl "${pattern}" ${directory} \
            --exclude-dir=node_modules \
            --exclude-dir=.git \
            --exclude-dir=dist \
            --exclude-dir=build \
            --exclude-dir=.next \
            --exclude="*.log" \
            --exclude="*.map" \
            2>/dev/null || true`;

    const result = await sandbox.commands.run(grepCmd, { timeoutMs: 30000 });

    const files = result.stdout
      .split('\n')
      .filter(path => path.trim() !== '')
      .slice(0, 20);

    console.log(`\nFound ${files.length} matching files:`);
    if (files.length > 0) {
      files.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file}`);
      });
    } else {
      console.log('  No files found matching keywords');
    }
    console.log('');

    return files;
  }

  /**
   * Use LLM to select which files need modification
   * Extracted from sandbox_executor.ts lines 170-238
   */
  async selectFilesToModify(
    sandbox: Sandbox,
    userPrompt: string,
    candidateFiles: string[],
    repoPath: string = '/home/user/project'
  ): Promise<string[]> {
    console.log(`\nUsing LLM to analyze ${candidateFiles.length} candidate files...`);

    const fileContents = new Map<string, string>();
    for (const filePath of candidateFiles) {
      try {
        // Convert relative path to absolute path
        const absolutePath = filePath.startsWith('/')
          ? filePath
          : `${repoPath}/${filePath}`;

        const content = await sandbox.files.read(absolutePath);
        fileContents.set(absolutePath, content);
        console.log(`   Read ${filePath} (${content.length} chars)`);
      } catch (error) {
        console.error(`   Failed to read ${filePath}:`, (error as Error).message);
      }
    }

    let filesSection = '';
    fileContents.forEach((content, path) => {
      filesSection += `\n### FILE: ${path}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    });

    const llmPrompt = `You are an expert software developer. Given a user's request and multiple candidate files, identify ALL files that should be modified.

    USER REQUEST:
    ${userPrompt}

    CANDIDATE FILES WITH COMPLETE CODE:
    ${filesSection}

    INSTRUCTIONS:
    - Analyze each file's complete code
    - Determine which files are relevant to the user's request
    - If the request applies to ALL files (like "add comments to all .py files"), return ALL file paths
    - If the request is specific (like "fix bug in auth.py"), return only that file
    - Return one file path per line
    - Paths should be exactly as shown above

    OUTPUT FORMAT:
    Return file paths, one per line:
    /home/user/project/helper.py
    /home/user/project/main.py
    /home/user/project/unknow.py`;

    console.log('\nSending to LLM for analysis...');

    const { text } = await generateText({
      model: gemini,
      prompt: llmPrompt,
      maxOutputTokens: 200,
    });

    // Parse multiple file paths
    const selectedFiles = text
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.startsWith('/'));

    console.log(`\nLLM Selected ${selectedFiles.length} file(s):`);
    selectedFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`);
    });
    console.log('');

    return selectedFiles;
  }

  /**
   * Generate code changes using AI
   * Extracted from worker.ts lines 98-120
   */
  async generateCodeChanges(
    repoUrl: string,
    task: string,
    fileContents: Map<string, string>,
    relevantFiles: string[],
    allFiles: string[],
    keywords: string[]
  ): Promise<GenerateOutput> {
    const prompt = this.buildPrompt(repoUrl, task, fileContents, relevantFiles, allFiles, keywords);

    console.log('Calling generateObject with schema...');
    const startTime = Date.now();

    const result = await generateObject({
      model: gemini,
      schema: GenerationSchema,
      prompt,
    });

    const duration = Date.now() - startTime;
    console.log(`generateObject finished in ${duration}ms`);

    if (!result.object) {
      console.error('object is undefined');
      throw new Error('Generation failed - object is undefined');
    }

    console.log('Successfully got generation object');
    return result.object as GenerateOutput;
  }

  /**
   * Build prompt for AI code generation
   * Extracted from worker.ts lines 173-251
   */
  private buildPrompt(
    repoUrl: string,
    task: string,
    fileContents: Map<string, string>,
    candidateFiles: string[],
    allFiles: string[],
    keywords: string[]
  ): string {
    let filesToModifySection = '';
    fileContents.forEach((content, path) => {
      filesToModifySection += `\n=== FILE: ${path} ===\n\`\`\`\n${content}\n\`\`\`\n\n`;
    });

    const candidatesList = candidateFiles.map((f, i) => `  ${i + 1}. ${f}`).join('\n');
    const fileTreeSection = allFiles.slice(0, 100).join('\n');

    return `You are an expert software developer modifying an existing codebase.

REPOSITORY: ${repoUrl}
USER REQUEST: ${task}
SEARCH KEYWORDS: ${keywords.join(', ')}

=== FILES TO MODIFY ===
${filesToModifySection}

=== CANDIDATE FILES ANALYZED ===
${candidatesList}

=== FULL PROJECT STRUCTURE (first 100 files) ===
${fileTreeSection}

CRITICAL INSTRUCTIONS:
1. **Modify ALL files shown in "FILES TO MODIFY" section**
2. Make MINIMAL, surgical changes - only modify what's needed
3. Preserve existing code style and patterns
4. Ensure changes are consistent across all files
5. Use absolute paths starting with: /home/user/project/...

OUTPUT REQUIREMENTS:
- **fileOperations**: Array of operations (one or more per file)
  - type: Choose based on scope of changes:
    * 'updateFile' - For small, targeted changes (< 50% of file)
    * 'rewriteFile' - For major refactoring (> 50% of file)
    * 'createFile' - Only for entirely new files
  - path: Absolute path (e.g., /home/user/project/src/components/Button.tsx)
  - content: (for createFile/rewriteFile) Complete, valid code
  - searchReplace: (for updateFile) Array of {search: string, replace: string} patterns

- **shellCommands**: Array of commands (ONLY if absolutely necessary)
  - Example: ["npm install lodash"] if adding new dependency
  - Default: [] (empty array if no commands needed)

- **explanation**: Brief explanation of what changed and why

EXAMPLE OUTPUT FOR MULTIPLE FILES:
\`\`\`json
{
  "fileOperations": [
    {
      "type": "updateFile",
      "path": "/home/user/project/helper.py",
      "searchReplace": [
        {
          "search": "def add(a, b):",
          "replace": "# Adds two numbers\\ndef add(a, b):"
        }
      ]
    },
    {
      "type": "updateFile",
      "path": "/home/user/project/main.py",
      "searchReplace": [
        {
          "search": "def main():",
          "replace": "# Main entry point\\ndef main():"
        }
      ]
    }
  ],
  "shellCommands": [],
  "explanation": "Added comments to all Python functions across helper.py and main.py"
}
\`\`\`

Remember: You must generate operations for ALL files in the "FILES TO MODIFY" section!`;
  }
}
