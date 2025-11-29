/**
 * Utility Helper Functions
 *
 * Contains simple utility functions used across the application
 */

/**
 * Generate meaningful branch name from task description
 */
export function generateBranchName(task: string): string {
  const keywords = extractKeywords(task).slice(0, 4);
  const slug = keywords.join('-');
  const shortHash = Date.now().toString(36).slice(-6);

  const maxLength = 50;
  const truncatedSlug = slug.length > maxLength
    ? slug.substring(0, maxLength)
    : slug;

  return `feat/${truncatedSlug}-${shortHash}`;
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
