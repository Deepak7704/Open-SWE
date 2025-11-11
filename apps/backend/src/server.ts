// IMPORTANT: Load environment variables FIRST before any other imports
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { createQueue, QUEUE_NAMES, connection } from '@openswe/shared/queues';
import webhookRoute from '../routes/webhook';
import installationRoute from '../routes/installation';

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL;

console.log('Starting Primary Backend');

const chatQueue = createQueue(QUEUE_NAMES.WORKER_JOB);
const indexingQueue = createQueue(QUEUE_NAMES.INDEXING);

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));

// Configure JSON parser with raw body capture for webhook signature verification
// The 'verify' function runs BEFORE JSON parsing and stores the raw buffer
// This is essential because GitHub signs the raw payload, not the parsed JSON
app.use(express.json({
  limit: '10mb',
  verify: (req: any, res, buf) => {
    // Store raw buffer in req.rawBody for webhook signature verification
    // Without this, we can't verify GitHub webhook signatures
    req.rawBody = buf;
  }
}));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.post('/api/chat', async (req, res) => {
  try {
    const { repoUrl, task } = req.body;

    if (!repoUrl || !task) {
      return res.status(400).json({ error: 'Missing repoUrl or task' });
    }

    // Extract repoId from GitHub URL (e.g., "https://github.com/owner/repo" -> "owner/repo")
    const repoId = repoUrl
      .replace(/^https?:\/\/(www\.)?github\.com\//, '')
      .replace('.git', '')
      .replace(/\/$/, '')
      .trim();

    console.log(`Code generation request - Repo: ${repoId}, Task: ${task}`);

    // Check if repository is already indexed (check for BM25 index in Redis)
    const bm25Key = `bm25:index:${repoId}`;
    const isIndexed = await connection.exists(bm25Key);

    if (!isIndexed) {
      console.log(`Repository ${repoId} not indexed. Triggering automatic indexing...`);

      // Trigger indexing job first
      const projectId = `index-${Date.now()}`;
      const indexingJob = await indexingQueue.add(
        'index-repo',
        {
          projectId,
          repoUrl,
          repoId,
          branch: 'main',
          task: 'Auto-index repository'
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 }
        }
      );

      console.log(`Indexing job ${indexingJob.id} queued for ${repoId}`);

      // Queue code generation job with dependency on indexing
      const codeGenJob = await chatQueue.add(
        'process',
        {
          repoUrl,
          task,
          repoId,
          indexingJobId: indexingJob.id
        },
        {
          // Wait for indexing to complete first
          delay: 60000 // Start checking after 1 minute
        }
      );

      return res.status(202).json({
        message: 'Repository not indexed. Indexing automatically...',
        indexing: true,
        indexingJobId: indexingJob.id,
        codeGenJobId: codeGenJob.id,
        repoId: repoId,
        statusUrl: `/api/status/${codeGenJob.id}`,
        indexingStatusUrl: `/api/index-status/${indexingJob.id}`,
        estimatedTime: '3-5 minutes for indexing, then code generation'
      });
    }

    // Repository already indexed, proceed with code generation
    console.log(`Repository ${repoId} already indexed. Proceeding with code generation...`);

    const job = await chatQueue.add('process', {
      repoUrl,
      task,
      repoId
    });

    res.status(202).json({
      message: 'Task queued',
      indexing: false,
      jobId: job.id,
      repoId: repoId,
      statusUrl: `/api/status/${job.id}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status/:jobId', async (req, res) => {
  try {
    const job = await chatQueue.getJob(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      jobId: job.id,
      state: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'primary-backend' });
});

// Mount webhook route
// This handles GitHub webhook events (push, pull_request, etc.)
app.use('/webhook', webhookRoute);

// Mount installation route
// This handles GitHub App installation events
app.use('/installation', installationRoute);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`POST /api/chat - Chat endpoint`);
  console.log(`POST /api/index - Indexing endpoint`);
  console.log(`GET /api/status/:jobId - Chat job status`);
  console.log(`GET /api/index-status/:jobId - Indexing job status`);
  console.log(`POST /webhook/github - GitHub webhook endpoint`);
  console.log(`GET /webhook/health - Webhook health check`);
  console.log(`POST /installation - GitHub App installation webhook`);
  console.log(`GET /installation/list - List all installations`);
  console.log(`GET /health - Health check\n`);
  console.log(`CORS enabled for: ${FRONTEND_URL}`);
  console.log(`Queue: Redis on ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
});

export default app;
export { indexingQueue, chatQueue };
