import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { RepositoryIndexer } from '../services/repository.service';
import { EmbeddingService } from '../services/embedding.service';
import { BM25Service } from '../services/bm25.service';
import { VectorDBService } from '../services/vectordb.service';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
});

export class IndexingProcessor {
  static async createWorker() {
    const worker = new Worker(
      'indexing',
      async (job: Job) => {
        return await IndexingProcessor.processIndexingJob(job);
      },
      {
        connection: redis,
        concurrency: 1
      }
    );

    worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed: ${err.message}`);
    });

    return worker;
  }

  static async processIndexingJob(job: Job) {
    const { projectId, repoUrl, repoId, branch = 'main' } = job.data;

    console.log('\n' + '='.repeat(70));
    console.log('INDEXING JOB START');
    console.log('='.repeat(70) + '\n');

    try {
      console.log(`Project: ${projectId}`);
      console.log(`Repository: ${repoUrl}`);
      console.log(`Branch: ${branch}\n`);

      await job.updateProgress(10);

      console.log('STEP 1: Extracting chunks\n');
      const repositoryIndexer = new RepositoryIndexer();
      const chunks = await repositoryIndexer.indexRepository(
        projectId,
        repoUrl,
        branch
      );

      if (chunks.length === 0) {
        throw new Error('No chunks found');
      }

      await job.updateProgress(25);
      console.log(`Extracted ${chunks.length} chunks\n`);

      console.log('STEP 2: Generating embeddings\n');
      const embeddingService = new EmbeddingService();
      const embeddings = await embeddingService.generateEmbeddings(chunks);
      await job.updateProgress(50);
      console.log(`Generated ${embeddings.length} embeddings\n`);

      console.log('STEP 3: Building BM25 index\n');
      const bm25Service = new BM25Service(redis, repoId);
      await bm25Service.buildIndex(chunks);
      await job.updateProgress(65);

      console.log('STEP 4: Storing vectors\n');
      const vectorDB = new VectorDBService();
      await vectorDB.initialize(repoId);

      const vectors = chunks
        .map((chunk, idx) => {
          const embedding = embeddings[idx];

          if (!embedding || embedding.length === 0) {
            console.warn(`Skipping ${chunk.id}: no embedding`);
            return null;
          }

          // Build metadata object, filtering out null/undefined values
          const metadata: Record<string, any> = {
            repoId,
            repoUrl,
            projectId,
            filePath: chunk.filePath,
            fileName: chunk.fileName,
            lineStart: chunk.lineStart,
            lineEnd: chunk.lineEnd,
            content: chunk.content.substring(0, 1000),
            chunkType: chunk.chunkType,
            indexedAt: new Date().toISOString()
          };

          // Only add functionName if it's not null
          if (chunk.functionName !== null) {
            metadata.functionName = chunk.functionName;
          }

          return {
            id: chunk.id,
            values: embedding as number[],
            metadata
          };
        })
        .filter((vector): vector is NonNullable<typeof vector> => vector !== null);

      if (vectors.length === 0) {
        throw new Error('No valid vectors');
      }

      console.log(`Storing ${vectors.length} vectors\n`);
      await vectorDB.upsertVectors(vectors);
      await job.updateProgress(90);

      console.log('='.repeat(70));
      console.log('INDEXING COMPLETE');
      console.log('='.repeat(70));
      console.log(`Chunks: ${chunks.length}`);
      console.log(`Vectors: ${vectors.length}`);
      console.log('='.repeat(70) + '\n');

      await job.updateProgress(100);

      return {
        success: true,
        repoId,
        projectId,
        chunksCreated: chunks.length,
        vectorsStored: vectors.length,
        completedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Indexing failed:', error);
      throw error;
    }
  }
}
