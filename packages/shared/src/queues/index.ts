import { Queue } from 'bullmq'
import type { QueueOptions } from 'bullmq'
import IORedis from 'ioredis'


// Only set password if it exists and is not empty
const redisPassword = process.env.REDIS_PASSWORD?.trim();

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: redisPassword || undefined,
  maxRetriesPerRequest: null,
})

// Handle connection errors
connection.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

connection.on('connect', () => {
  console.log(' Redis connected successfully');
});

export const QUEUE_NAMES = {
  WORKER_JOB: 'worker-job', // Type: "worker-job" (literal)
  INDEXING: 'indexing',
} as const

export const createQueue = (name: string, options?: QueueOptions) => {
  return new Queue(name, {
    connection,
    ...options,
  })
}

export { connection }
