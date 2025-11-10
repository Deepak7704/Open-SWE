import { Router } from 'express';
import crypto from 'crypto';
import { indexingQueue, chatQueue } from '../src/server';

// Get webhook secret from environment variables
// This should match the secret you configure in GitHub webhook settings
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'hemanth';

const router = Router();

/**
 * Verifies that the webhook request actually came from GitHub
 *
 * How it works:
 * 1. GitHub signs the webhook payload with your secret using HMAC-SHA256
 * 2. They send this signature in the X-Hub-Signature-256 header
 * 3. We compute the same signature on our end using the raw payload
 * 4. If signatures match, we know it's genuinely from GitHub
 *
 * Security: Uses timingSafeEqual to prevent timing attacks
 *
 * @param payload - Raw request body buffer (before JSON parsing)
 * @param signature - Signature from X-Hub-Signature-256 header
 * @returns true if signature is valid, false otherwise
 */
function verifySignature(payload: Buffer, signature: string): boolean {
  if (!signature) {
    console.log('No signature provided in request');
    return false;
  }

  // Create HMAC using SHA-256 and the webhook secret
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);

  // Compute the signature from the raw payload
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  // This ensures comparison takes same time regardless of where strings differ
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signature)
    );
  } catch (error) {
    // timingSafeEqual throws if buffers have different lengths
    console.log('Signature length mismatch');
    return false;
  }
}

/**
 * GitHub Webhook Endpoint
 *
 * This endpoint listens to events from GitHub (push, pull_request, etc.)
 * and triggers appropriate actions in your system.
 *
 * Route: POST /webhook/github
 */
router.post('/github', async (req, res) => {
  try {
    // Extract GitHub webhook headers
    const signature = req.header('X-Hub-Signature-256') || '';
    const event = req.header('X-GitHub-Event') || '';
    const deliveryId = req.header('X-GitHub-Delivery') || '';

    const body = req.body;
    const rawBody = (req as any).rawBody as Buffer;

    console.log(`\n=== Webhook Received ===`);
    console.log(`Event: ${event}`);
    console.log(`Delivery ID: ${deliveryId}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);

    // CRITICAL: Verify the webhook signature
    // This prevents unauthorized requests from triggering your system
    if (!verifySignature(rawBody, signature)) {
      console.error(' Invalid signature - rejecting webhook');
      return res.status(403).json({
        error: 'Invalid signature',
        message: 'Webhook signature verification failed'
      });
    }

    console.log('Signature verified');

    // Extract repository information from webhook payload
    const repoName = body?.repository?.full_name; // e.g., "owner/repo"
    const repoUrl = body?.repository?.clone_url;  // e.g., "https://github.com/owner/repo.git"
    const repoHtmlUrl = body?.repository?.html_url; // e.g., "https://github.com/owner/repo"

    if (!repoName || !repoUrl) {
      console.error(' Missing repository information in webhook payload');
      return res.status(400).json({
        error: 'Missing repository information'
      });
    }

    console.log(`Repository: ${repoName}`);

    // Handle different GitHub webhook events
    switch (event) {
      case 'push':
        /**
         * PUSH EVENT
         * Triggered when code is pushed to a branch
         *
         * Use case: Automatically re-index repository when code changes
         */
        const branch = body.ref?.replace('refs/heads/', '') || 'main';
        const commits = body.commits || [];
        const pusher = body.pusher?.name || 'unknown';

        console.log(` Push to branch: ${branch}`);
        console.log(` Pushed by: ${pusher}`);
        console.log(` Commits: ${commits.length}`);

        // Queue an indexing job to update the code index
        const indexJob = await indexingQueue.add(
          'index-repo',
          {
            projectId: repoName,
            repoUrl: repoHtmlUrl,
            repoId: repoName,
            branch: branch,
            timestamp: Date.now(),
            trigger: 'webhook',
            event: 'push',
            pusher: pusher,
            commits: commits.length,
          },
          {
            // Retry configuration
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000, // Start with 2s delay
            },
          }
        );

        console.log(` Indexing job queued: ${indexJob.id}`);

        return res.status(200).json({
          message: 'Push event processed successfully',
          event: 'push',
          repository: repoName,
          branch: branch,
          jobId: indexJob.id,
          statusUrl: `/api/index-status/${indexJob.id}`,
        });

      case 'pull_request':
        /**
         * PULL REQUEST EVENT
         * Triggered when a PR is opened, closed, reopened, etc.
         *
         * Use case: Analyze PR changes, run code review, etc.
         */
        const action = body.action; // opened, closed, reopened, etc.
        const prNumber = body.pull_request?.number;
        const prTitle = body.pull_request?.title;
        const prBranch = body.pull_request?.head?.ref;

        console.log(` Pull Request #${prNumber}: ${action}`);
        console.log(` Title: ${prTitle}`);
        console.log(` Branch: ${prBranch}`);

        // Only index on PR opened or synchronized (new commits pushed)
        if (action === 'opened' || action === 'synchronize') {
          const prIndexJob = await indexingQueue.add(
            'index-repo',
            {
              projectId: `${repoName}/pr-${prNumber}`,
              repoUrl: repoHtmlUrl,
              repoId: repoName,
              branch: prBranch,
              timestamp: Date.now(),
              trigger: 'webhook',
              event: 'pull_request',
              prNumber: prNumber,
              action: action,
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            }
          );

          console.log(` PR indexing job queued: ${prIndexJob.id}`);

          return res.status(200).json({
            message: 'Pull request event processed',
            event: 'pull_request',
            action: action,
            repository: repoName,
            prNumber: prNumber,
            jobId: prIndexJob.id,
            statusUrl: `/api/index-status/${prIndexJob.id}`,
          });
        }

        return res.status(200).json({
          message: 'Pull request event received',
          action: action,
          note: 'No indexing triggered for this action',
        });

      case 'ping':
        /**
         * PING EVENT
         * Sent when you first create the webhook in GitHub
         * Used to verify the endpoint is accessible
         */
        console.log(' Ping event - webhook is connected!');
        const zen = body.zen;

        return res.status(200).json({
          message: 'Webhook is active',
          event: 'ping',
          zen: zen,
        });

      case 'repository':
        /**
         * REPOSITORY EVENT
         * Triggered when repository is created, deleted, archived, etc.
         */
        const repoAction = body.action;
        console.log(` Repository ${repoAction}: ${repoName}`);

        return res.status(200).json({
          message: 'Repository event received',
          event: 'repository',
          action: repoAction,
        });

      default:
        /**
         * UNHANDLED EVENTS
         * Log but don't process events we don't care about
         */
        console.log(`Unhandled event type: ${event}`);

        return res.status(200).json({
          message: 'Event received but not processed',
          event: event,
          note: 'This event type is not currently handled',
        });
    }

  } catch (error: any) {
    console.error(' Webhook processing error:', error);

    // Return 500 so GitHub knows the webhook failed
    // GitHub will retry the webhook delivery
    return res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
    });
  }
});

/**
 * Webhook health check endpoint
 * Useful for monitoring and debugging
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'webhook',
    timestamp: new Date().toISOString(),
  });
});

export default router;
