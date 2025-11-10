import 'dotenv/config';
import { Worker } from 'bullmq';
import { connection, QUEUE_NAMES } from '@openswe/shared/queues';
import { IndexingProcessor } from './processors/indexing.processor';
import { JobProcessor } from './processors/job.processor';

console.log('Starting Worker');


async function start() {
  try {
    console.log('Creating workers...\n');

    // Worker 1: Indexing (processes indexing queue)
    const indexingWorker = await IndexingProcessor.createWorker();
    console.log(' Indexing worker created');

    // Worker 2: Chat/Code Generation (processes worker-job queue)
    const githubToken = process.env.GITHUB_ACCESS_TOKEN;
    if (!githubToken) {
      throw new Error('GITHUB_ACCESS_TOKEN not found in environment');
    }

    const jobProcessor = new JobProcessor(githubToken, connection);

    const chatWorker = new Worker(
      'worker-job',
      async (job) => {
        console.log('\n' + '='.repeat(70));
        console.log(`CHAT JOB START - Job ID: ${job.id}`);
        console.log('='.repeat(70) + '\n');

        const result = await jobProcessor.process(job);

        console.log('\n' + '='.repeat(70));
        console.log(`CHAT JOB COMPLETE - Job ID: ${job.id}`);
        console.log('='.repeat(70) + '\n');

        return result;
      },
      {
        connection,
        concurrency: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      }
    );

    chatWorker.on('completed', (job) => {
      console.log(` Chat job ${job.id} completed`);
    });

    chatWorker.on('failed', (job, err) => {
      console.error(` Chat job ${job?.id} failed:`, err.message);
    });

    console.log(' Chat worker created\n');

    console.log('Workers listening for jobs...\n');
    console.log(`Queue 1: indexing (Repository indexing)`);
    console.log(`Queue 2: worker-job (Chat/Code generation)`);
    console.log(`Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}\n`);

    process.on('SIGINT', async () => {
      console.log('\nShutting down workers...');
      await indexingWorker.close();
      await chatWorker.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('Worker startup failed:', error);
    process.exit(1);
  }
}

start();
