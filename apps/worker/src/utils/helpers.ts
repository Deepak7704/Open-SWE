/**
 * Utility Helper Functions
 *
 * Contains simple utility functions used across the application
 */

/**
 * Generate unique branch name for bot updates
 * Extracted from worker.ts line 139
 */
export function generateBranchName(): string {
  return `bot/update-${Date.now()}`;
}

/**
 * Extract meaningful keywords from natural language prompts
 * Extracted from sandbox_executor.ts lines 135-145
 */
export function extractKeywords(prompt: string): string[] {
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from'];

  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));

  return [...new Set(words)];
}
