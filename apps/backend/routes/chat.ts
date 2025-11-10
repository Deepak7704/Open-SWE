import { Router } from 'express';
import { indexingQueue } from '../src/server';
const router = Router();

router.post('/index', async (req, res) => {
  try {
    const { projectId, repoUrl, branch = 'main' } = req.body;

    if (!projectId || !repoUrl) {
      return res.status(400).json({
        error: 'Missing projectId or repoUrl',
      });
    }

    const job = await indexingQueue.add('index-repo', {
      projectId,
      repoUrl,
      repoId: projectId,
      branch,
      timestamp: Date.now(),
    });

    console.log(`Job queued: ${job.id}`);

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

router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await indexingQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
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
