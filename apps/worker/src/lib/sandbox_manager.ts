import { Sandbox } from '@e2b/code-interpreter';
import 'dotenv/config';

export class SandboxManager {
  private sandboxes = new Map<string, Sandbox>();
  private readonly TIMEOUT = 30 * 60 * 1000; // 30 minutes

  async create(projectId: string): Promise<Sandbox> {
    console.log(`Creating sandbox for project: ${projectId}`);

    // Validate required environment variables
    if (!process.env.E2B_API_KEY) {
      throw new Error('E2B_API_KEY is not set in environment variables');
    }

    // Create sandbox without template (uses default E2B environment)
    const sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
      timeoutMs: this.TIMEOUT,
    });

    console.log(`Sandbox created with ID: ${sandbox.sandboxId}`);
    console.log('Sandbox ready');

    // Store sandbox reference
    this.sandboxes.set(projectId, sandbox);

    // Schedule automatic cleanup after timeout
    setTimeout(() => {
      this.cleanup(projectId);
    }, this.TIMEOUT);

    return sandbox;
  }

  /**
   * Get existing sandbox by project ID
   */
  get(projectId: string): Sandbox | undefined {
    return this.sandboxes.get(projectId);
  }

  /**
   * Clean up and kill a sandbox
   *
   * IMPORTANT: Removes sandbox from map FIRST to prevent memory leaks.
   * If sandbox.kill() fails, the reference is still removed to avoid:
   * 1. Memory leaks from failed cleanup attempts
   * 2. Repeated cleanup attempts on dead sandboxes
   * 3. Map growing indefinitely with stale references
   *
   * E2B will eventually timeout and clean up abandoned sandboxes automatically.
   */
  async cleanup(projectId: string): Promise<void> {
    const sandbox = this.sandboxes.get(projectId);
    if (sandbox) {
      // CRITICAL: Remove from map FIRST (idempotent cleanup)
      // This prevents memory leaks even if sandbox.kill() fails
      this.sandboxes.delete(projectId);

      try {
        await sandbox.kill();
        console.log(`[Sandbox] Cleaned up successfully: ${projectId}`);
      } catch (error) {
        console.error(`[Sandbox] Failed to kill sandbox ${projectId}:`, error);
        // Sandbox reference already removed → prevents memory leak
        // E2B will eventually timeout and clean up the sandbox server-side
      }
    }
  }

  /**
   * Get list of all active sandbox project IDs
   */
  getActiveSandboxes(): string[] {
    return Array.from(this.sandboxes.keys());
  }
}