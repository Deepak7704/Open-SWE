import { createQueue, QUEUE_NAMES } from '@openswe/shared/queues';

export const workerQueue = createQueue('worker-queue');
