import { Router } from 'express';
import { randomUUID } from 'crypto';
import { indexingQueue } from '../src/server';
import { authenticateUser } from '../middleware/auth.middleware';
const router = Router();

router.post('/index', authenticateUser, async (req, res) => {
  try {
    const { projectId, repoUrl, branch = 'main' } = req.body;
    const userId = req.user!.userId;
    const username = req.user!.username;

    if (!projectId || !repoUrl) {
      return res.status(400).json({
        error: 'Missing projectId or repoUrl',
      });
    }

    const jobId = randomUUID();
    const job = await indexingQueue.add('index-repo', {
      projectId,
      repoUrl,
      repoId: projectId,
      branch,
      timestamp: Date.now(),
      userId,
      username
    }, {
      jobId
    });

    console.log(`[Index] Job ${job.id} queued by user ${username}`);

    res.status(202).json({
      message: 'Job queued successfully',
      jobId: job.id,
      status: 'queued',
      statusUrl: `/index/status/${job.id}`,
    });

  } catch (error: any) {
    console.error('Error queuing job:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/index-status/:jobId', authenticateUser, async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user!.userId;

    if (!jobId || jobId === 'undefined' || jobId === 'null') {
      console.log(`[Index Status] Invalid jobId received: ${jobId}`);
      return res.status(400).json({ error: 'Valid Job ID is required' });
    }

    const job = await indexingQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Verify job ownership
    if (job.data.userId !== userId) {
      console.log(`[Index Status] User ${userId} attempted to access job ${job.id} owned by ${job.data.userId}`);
      return res.status(403).json({ error: 'Forbidden: You do not have access to this job' });
    }

    const state = await job.getState();
    const progress = job.progress;

    res.json({
      jobId: job.id,
      state,
      progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
