/**
 * AI Service
 *
 * Handles all AI-related operations:
 * - File discovery using LangGraph
 * - LLM-based file selection (with code skeletons)
 * - AI code generation with enhanced context
 * - Prompt building with structural summaries
 *
 * Extracted from worker.ts lines 70-120, 173-251
 * and sandbox_executor.ts lines 93-129, 170-238
 */

import { Sandbox } from '@e2b/code-interpreter';
import { generateObject, generateText } from 'ai';
import type { Redis } from 'ioredis';
import gemini from '../lib/ai_config';
import { GenerationSchema, type GenerateOutput } from '@openswe/shared';
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
   * 
   * NOTE: This method reads full file contents - use selectFilesToModifyWithSkeletons() for better performance
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
   * Select files to modify using CODE SKELETONS (not full content)
   * This saves ~70-80% of LLM tokens while maintaining full context
   */
  async selectFilesToModifyWithSkeletons(
  userPrompt: string,
  skeletons: Map<string, string>,
  repoPath: string
): Promise<string[]> {
  console.log(`\nAnalyzing ${skeletons.size} files using code skeletons...`);

  let skeletonsSection = '';
  skeletons.forEach((skeleton, path) => {
    skeletonsSection += `\n${skeleton}\n`;
  });

  const llmPrompt = `You are a code analysis expert. Your task is to identify which files need modification based on a user's request.

USER REQUEST:
${userPrompt}

AVAILABLE FILES (Code Skeletons):
${skeletonsSection}

TASK:
Analyze each file's structure and select the files that need modification to fulfill the user's request.

SELECTION CRITERIA:
1. Does the file contain functions/components mentioned in the request?
2. Does the file handle the feature being modified?
3. Would modifying this file directly address the user's request?

CRITICAL OUTPUT RULES:
- Output ONLY file paths, one per line
- Use the EXACT path format: /home/user/project/...
- NO explanations, NO numbering, NO bullets, NO markdown
- If uncertain, select 1-3 most relevant files

EXAMPLE OUTPUT:
/home/user/project/src/components/screens/InboxPage.tsx
/home/user/project/src/hooks/useSearch.tsx

YOUR OUTPUT (file paths only):`;

  console.log('\nSending skeletons to LLM for analysis...');
  
  const { text } = await generateText({
    model: gemini,
    prompt: llmPrompt,
    maxOutputTokens: 500,
  });

  console.log('\n--- RAW LLM RESPONSE ---');
  console.log(text);
  console.log('--- END RESPONSE ---\n');

  // FIX: More flexible and robust parsing
  const lines = text.trim().split('\n');
  const selectedFiles: string[] = [];

  for (const line of lines) {
    let trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Skip common markdown/formatting prefixes
    if (trimmed.startsWith('#') || trimmed.startsWith('**')) continue;

    // Remove bullets, numbers, and list markers
    trimmed = trimmed.replace(/^[-*•\d.)\]]+\s*/, '');

    // Remove markdown code backticks
    trimmed = trimmed.replace(/^`+|`+$/g, '');

    // Remove quotes
    trimmed = trimmed.replace(/^["']|["']$/g, '');

    trimmed = trimmed.trim();

    // Must contain a path separator and have a valid extension
    const hasPathSeparator = trimmed.includes('/');
    const hasValidExtension = /\.(tsx?|jsx?|py|java|go|rs|cpp|c|h|vue|svelte)$/i.test(trimmed);

    if (!hasPathSeparator || !hasValidExtension) continue;

    // Extract file path (handle both absolute and relative)
    let filePath = trimmed;

    // If relative path, convert to absolute
    if (!filePath.startsWith('/')) {
      // Remove 'src/' prefix duplication if present
      if (filePath.startsWith('src/') && repoPath.endsWith('/project')) {
        filePath = `${repoPath}/${filePath}`;
      } else {
        filePath = `${repoPath}/${filePath}`;
      }
    }

    // Validate it's within the project directory
    if (filePath.startsWith('/home/user/project/')) {
      // Avoid duplicates
      if (!selectedFiles.includes(filePath)) {
        selectedFiles.push(filePath);
      }
    }
  }

  console.log(`\nLLM Selected ${selectedFiles.length} file(s):`);
  if (selectedFiles.length > 0) {
    selectedFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`);
    });
  } else {
    console.warn('\n⚠️  WARNING: LLM selected 0 files from code skeletons!');
    console.warn('Available files in skeletons:');
    let count = 0;
    for (const [path] of skeletons) {
      console.warn(`  ${count + 1}. ${path}`);
      count++;
      if (count >= 5) {
        console.warn(`  ... and ${skeletons.size - count} more`);
        break;
      }
    }
    console.warn('\nPossible reasons:');
    console.warn('1. LLM output format doesn\'t match expected format');
    console.warn('2. No files are relevant to the user request');
    console.warn('3. Parsing logic needs adjustment');
    console.warn('\n💡 Fallback will use hybrid search ranking instead\n');
  }

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
    keywords: string[],
    packageManager: string = 'npm',
    skeletons?: Map<string, string>  // Optional code skeletons for context
  ): Promise<GenerateOutput> {
    const prompt = this.buildPrompt(
      repoUrl,
      task,
      fileContents,
      relevantFiles,
      allFiles,
      keywords,
      packageManager,
      skeletons
    );

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
   * Build enhanced prompt for AI code generation with code skeleton context
   * Extracted from worker.ts lines 173-251
   */
  private buildPrompt(
    repoUrl: string,
    task: string,
    fileContents: Map<string, string>,
    candidateFiles: string[],
    allFiles: string[],
    keywords: string[],
    packageManager: string,
    skeletons?: Map<string, string>
  ): string {
    // Build full content section for files to modify
    let filesToModifySection = '';
    fileContents.forEach((content, path) => {
      filesToModifySection += `\n=== FILE: ${path} ===\n\`\`\`\n${content}\n\`\`\`\n\n`;
    });

    // Build context section with code skeletons (for related files)
    let contextSection = '';
    if (skeletons && skeletons.size > 0) {
      contextSection = '\n=== CONTEXT: Related Files (Code Skeletons) ===\n';
      contextSection += 'These are structural summaries of related files to help you understand the codebase:\n\n';

      skeletons.forEach((skeleton, path) => {
        // Only include skeletons for files NOT in filesToModify
        if (!fileContents.has(path)) {
          contextSection += `${skeleton}\n\n`;
        }
      });
    }

    const candidatesList = candidateFiles.map((f, i) => `  ${i + 1}. ${f}`).join('\n');
    const fileTreeSection = allFiles.slice(0, 100).join('\n');
    const packageManagerInstructions = this.getPackageManagerInstructions(packageManager);

    return `You are an expert software developer modifying an existing codebase.

REPOSITORY: ${repoUrl}
USER REQUEST: ${task}
SEARCH KEYWORDS: ${keywords.join(', ')}
PACKAGE MANAGER: ${packageManager}

=== FILES TO MODIFY (Full Content) ===
These are the files you MUST modify. Read their complete code below:
${filesToModifySection}
${contextSection}
=== CANDIDATE FILES ANALYZED ===
These files were analyzed for relevance:
${candidatesList}

=== FULL PROJECT STRUCTURE (first 100 files) ===
${fileTreeSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **Modify ALL files shown in "FILES TO MODIFY" section**
   - You must generate operations for EVERY file listed above
   - If a file doesn't need changes, explain why in the explanation field

2. **Make MINIMAL, surgical changes**
   - Only modify what's necessary to fulfill the user's request
   - Preserve existing code structure, style, and patterns
   - Don't refactor unrelated code

3. **Use the CONTEXT section wisely**
   - Code skeletons show structure of related files (functions, classes, imports)
   - Use this to understand dependencies and relationships
   - Do NOT modify files in the context section

4. **Ensure consistency**
   - Changes across multiple files should follow the same pattern
   - Maintain consistent naming conventions and style
   - If modifying interfaces/types, update all usages

5. **Path requirements**
   - Use absolute paths starting with: /home/user/project/...
   - Match paths exactly as shown in "FILES TO MODIFY" section

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return a JSON object with three fields:

**fileOperations**: Array of operations (one or more per file)
  - type: Choose based on scope of changes:
    * 'updateFile' - For small, targeted changes (< 50% of file)
      → Use search/replace patterns for surgical modifications
    * 'rewriteFile' - For major refactoring (> 50% of file)
      → Provide complete file content
    * 'createFile' - Only for entirely new files
      → Provide complete file content
  
  - path: Absolute path (e.g., /home/user/project/src/components/Button.tsx)
  
  - content: (for createFile/rewriteFile only)
    → Complete, valid, runnable code
    → Include all imports, exports, and necessary code
  
  - searchReplace: (for updateFile only)
    → Array of {search: string, replace: string} patterns
    → Each search string must be EXACT match from original file
    → Be specific - include surrounding context to avoid wrong matches

**shellCommands**: Array of commands (ONLY if absolutely necessary)
  ${packageManagerInstructions}
  - Use ONLY when new dependencies are required
  - Default: [] (empty array if no commands needed)
  - Examples:
    * Adding a dependency: ["${packageManager} install package-name"]
    * Running migrations: ["${packageManager} run migrate"]

**explanation**: Brief explanation (2-3 sentences)
  - What changed and why
  - How it fulfills the user's request
  - Any important considerations or trade-offs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Example 1: Small targeted changes (updateFile)
\`\`\`json
{
  "fileOperations": [
    {
      "type": "updateFile",
      "path": "/home/user/project/helper.py",
      "searchReplace": [
        {
          "search": "def add(a, b):\\n    return a + b",
          "replace": "def add(a, b):\\n    \\"\\"\\"Add two numbers together.\\"\\"\\"\\n    return a + b"
        }
      ]
    },
    {
      "type": "updateFile",
      "path": "/home/user/project/main.py",
      "searchReplace": [
        {
          "search": "def main():",
          "replace": "def main():\\n    \\"\\"\\"Main entry point of the application.\\"\\"\\""
        }
      ]
    }
  ],
  "shellCommands": [],
  "explanation": "Added docstrings to all Python functions in helper.py and main.py to improve code documentation."
}
\`\`\`

Example 2: Major refactoring (rewriteFile)
\`\`\`json
{
  "fileOperations": [
    {
      "type": "rewriteFile",
      "path": "/home/user/project/src/auth.ts",
      "content": "import bcrypt from 'bcrypt';\\nimport jwt from 'jsonwebtoken';\\n\\nexport class AuthService {\\n  async hashPassword(password: string): Promise<string> {\\n    return bcrypt.hash(password, 10);\\n  }\\n\\n  async verifyPassword(password: string, hash: string): Promise<boolean> {\\n    return bcrypt.compare(password, hash);\\n  }\\n\\n  generateToken(userId: string): string {\\n    return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });\\n  }\\n}"
    }
  ],
  "shellCommands": ["npm install bcrypt jsonwebtoken"],
  "explanation": "Completely rewrote auth.ts to use industry-standard bcrypt for password hashing and JWT for authentication tokens."
}
\`\`\`

Example 3: Creating new file
\`\`\`json
{
  "fileOperations": [
    {
      "type": "createFile",
      "path": "/home/user/project/src/config/database.ts",
      "content": "export const databaseConfig = {\\n  host: process.env.DB_HOST || 'localhost',\\n  port: parseInt(process.env.DB_PORT || '5432'),\\n  database: process.env.DB_NAME || 'myapp',\\n  username: process.env.DB_USER || 'postgres',\\n  password: process.env.DB_PASSWORD\\n};"
    }
  ],
  "shellCommands": [],
  "explanation": "Created new database configuration file to centralize database connection settings."
}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remember: 
- You MUST generate operations for ALL files in "FILES TO MODIFY" section
- Use code skeletons in CONTEXT section to understand relationships, but don't modify those files
- Be surgical - only change what's necessary
- Ensure all changes work together cohesively`;
  }

  /**
   * Get package manager specific instructions for AI
   */
  private getPackageManagerInstructions(packageManager: string): string {
    const defaultInstruction = '- Example: ["npm install lodash"] for adding dependencies';
    
    const instructions: Record<string, string> = {
      'npm': defaultInstruction,
      'pnpm': '- IMPORTANT: Use "pnpm add <package>" NOT "npm install".\n  - Example: ["pnpm add lodash"]',
      'yarn': '- IMPORTANT: Use "yarn add <package>" NOT "npm install".\n  - Example: ["yarn add lodash"]',
      'pip': '- IMPORTANT: Use "pip install <package>" for Python dependencies.\n  - Example: ["pip install requests"]',
      'cargo': '- IMPORTANT: Use "cargo add <package>" for Rust dependencies.\n  - Example: ["cargo add serde"]',
      'go': '- IMPORTANT: Use "go get <package>" for Go dependencies.\n  - Example: ["go get github.com/gin-gonic/gin"]',
      'bundler': '- IMPORTANT: Use "bundle add <gem>" for Ruby dependencies.\n  - Example: ["bundle add rails"]',
    };

    return instructions[packageManager] || defaultInstruction;
  }
}
