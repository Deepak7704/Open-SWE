  import { Worker, Job } from 'bullmq';
  import Redis from 'ioredis';
  import { connection } from '@openswe/shared/queues';
  import { RepositoryIndexer } from '../services/repository.service';
  import { EmbeddingService } from '../services/embedding.service';
  import { BM25Service } from '../services/bm25.service';
  import { VectorDBService } from '../services/vectordb.service';
  import type { CodeChunk } from '../services/chunking.service';

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null
  });

  interface BaseJob {
    projectId: string;
    repoUrl: string;
    repoId: string;
    branch: string;
    timestamp: number;
    trigger: string;
    event: string;
  }

  interface FullIndexJob extends BaseJob {
    indexType: 'full';
    beforeSHA?: string;
    afterSHA?: string;
  }

  interface IncrementalIndexJob extends BaseJob {
    indexType: 'incremental';
    beforeSHA: string;
    afterSHA: string;
    changedFiles: {
      added: string[];
      modified: string[];
      removed: string[];
    };
    totalChangedFiles: number;
  }

  type IndexJob = FullIndexJob | IncrementalIndexJob;

  export class IndexingProcessor {
    static async createWorker() {
      const worker = new Worker(
        'indexing',
        async (job: Job<IndexJob>) => {
          // Route to correct handler based on job name
          if (job.name === 'index-repo') {
            return await IndexingProcessor.processFullIndex(job as
  Job<FullIndexJob>);
          }
          if (job.name === 'incremental-index') {
            return await IndexingProcessor.processIncrementalIndex(job as Job<IncrementalIndexJob>);
          }
          throw new Error(`Unknown job type: ${job.name}`);
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

    // Full index: Index entire repository (existing logic unchanged)
    static async processFullIndex(job: Job<FullIndexJob>) {
      const { projectId, repoUrl, repoId, branch = 'main', afterSHA } =
  job.data;

      console.log('\n' + '='.repeat(70));
      console.log('FULL INDEXING JOB START');
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
        const embeddings = await
  embeddingService.generateEmbeddings(chunks);
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

            if (chunk.functionName !== null) {
              metadata.functionName = chunk.functionName;
            }

            return {
              id: chunk.id,
              values: embedding as number[],
              metadata
            };
          })
          .filter((vector): vector is NonNullable<typeof vector> =>
  vector !== null);

        if (vectors.length === 0) {
          throw new Error('No valid vectors');
        }

        console.log(`Storing ${vectors.length} vectors\n`);
        await vectorDB.upsertVectors(vectors);
        await job.updateProgress(90);

        // Store metadata for incremental indexing
        await redis.hset(`index:${repoId}:${branch}:meta`, {
          last_indexed_at: Date.now().toString(),
          last_index_type: 'full',
          last_indexed_sha: afterSHA || 'unknown'
        });

        console.log('='.repeat(70));
        console.log('FULL INDEXING COMPLETE');
        console.log('='.repeat(70));
        console.log(`Chunks: ${chunks.length}`);
        console.log(`Vectors: ${vectors.length}`);
        console.log('='.repeat(70) + '\n');

        await job.updateProgress(100);

        return {
          success: true,
          indexType: 'full',
          repoId,
          projectId,
          chunksCreated: chunks.length,
          vectorsStored: vectors.length,
          completedAt: new Date().toISOString()
        };

      } catch (error) {
        console.error('Full indexing failed:', error);
        throw error;
      }
    }

    // Incremental index: Update only changed files
    static async processIncrementalIndex(job: Job<IncrementalIndexJob>)
  {
      const {
        projectId,
        repoUrl,
        repoId,
        branch = 'main',
        beforeSHA,
        afterSHA,
        changedFiles,
        totalChangedFiles
      } = job.data;

      console.log('\n' + '='.repeat(70));
      console.log('INCREMENTAL INDEXING JOB START');
      console.log('='.repeat(70) + '\n');

      try {
        console.log(`Project: ${projectId}`);
        console.log(`Repository: ${repoUrl}`);
        console.log(`Branch: ${branch}`);
        console.log(`Range: ${beforeSHA.slice(0,
  7)}...${afterSHA.slice(0, 7)}`);
        console.log(`Files changed: ${totalChangedFiles}\n`);

        await job.updateProgress(10);

        // Initialize all services
        const repositoryIndexer = new RepositoryIndexer();
        const embeddingService = new EmbeddingService();
        const bm25Service = new BM25Service(redis, repoId);
        const vectorDB = new VectorDBService();
        await vectorDB.initialize(repoId);

        await job.updateProgress(20);

        // STEP 1: Remove deleted files from all indexes
        console.log(`STEP 1: Removing ${changedFiles.removed.length}
  deleted files\n`);

        for (const filePath of changedFiles.removed) {
          try {
            await bm25Service.removeFile(filePath);
            await vectorDB.deleteByFilePath(repoId, filePath);
            console.log(`Removed: ${filePath}`);
          } catch (error: any) {
            console.error(`Failed to remove ${filePath}:`,
  error.message);
          }
        }

        await job.updateProgress(40);

        // STEP 2: Index added and modified files
        const filesToIndex = [...changedFiles.added,
  ...changedFiles.modified];
        console.log(`\nSTEP 2: Indexing ${filesToIndex.length}
  added/modified files\n`);

        if (filesToIndex.length === 0) {
          console.log('No files to index\n');

          await redis.hset(`index:${repoId}:${branch}:meta`, {
            last_indexed_at: Date.now().toString(),
            last_index_type: 'incremental',
            last_indexed_sha: afterSHA
          });

          await job.updateProgress(100);

          return {
            success: true,
            indexType: 'incremental',
            repoId,
            projectId,
            filesRemoved: changedFiles.removed.length,
            filesIndexed: 0,
            chunksCreated: 0,
            vectorsStored: 0,
            completedAt: new Date().toISOString()
          };
        }

        // Index only specific files using new method
        const chunks = await repositoryIndexer.indexSpecificFiles(
          projectId,
          repoUrl,
          branch,
          filesToIndex
        );

        await job.updateProgress(60);
        console.log(`Extracted ${chunks.length} chunks\n`);

        if (chunks.length === 0) {
          console.log('No chunks extracted\n');

          await redis.hset(`index:${repoId}:${branch}:meta`, {
            last_indexed_at: Date.now().toString(),
            last_index_type: 'incremental',
            last_indexed_sha: afterSHA
          });

          await job.updateProgress(100);

          return {
            success: true,
            indexType: 'incremental',
            repoId,
            projectId,
            filesRemoved: changedFiles.removed.length,
            filesIndexed: filesToIndex.length,
            chunksCreated: 0,
            vectorsStored: 0,
            completedAt: new Date().toISOString()
          };
        }

        // STEP 3: Generate embeddings for changed chunks
        console.log('STEP 3: Generating embeddings\n');
        const embeddings = await
  embeddingService.generateEmbeddings(chunks);
        await job.updateProgress(70);
        console.log(`Generated ${embeddings.length} embeddings\n`);

        // STEP 4: Update BM25 index (remove old, add new)
        console.log('STEP 4: Updating BM25 index\n');
        await bm25Service.updateFiles(chunks);
        await job.updateProgress(80);

        // STEP 5: Upsert vectors (insert or update)
        console.log('STEP 5: Upserting vectors\n');
        const vectors = chunks
          .map((chunk, idx) => {
            const embedding = embeddings[idx];
            if (!embedding || embedding.length === 0) {
              console.warn(`Skipping ${chunk.id}: no embedding`);
              return null;
            }

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

            if (chunk.functionName !== null) {
              metadata.functionName = chunk.functionName;
            }

            return {
              id: chunk.id,
              values: embedding as number[],
              metadata
            };
          })
          .filter((vector): vector is NonNullable<typeof vector> =>
  vector !== null);

        console.log(`Upserting ${vectors.length} vectors\n`);
        await vectorDB.upsertVectors(vectors);
        await job.updateProgress(90);

        // Update metadata
        await redis.hset(`index:${repoId}:${branch}:meta`, {
          last_indexed_at: Date.now().toString(),
          last_index_type: 'incremental',
          last_indexed_sha: afterSHA
        });

        console.log('='.repeat(70));
        console.log('INCREMENTAL INDEXING COMPLETE');
        console.log('='.repeat(70));
        console.log(`Files removed: ${changedFiles.removed.length}`);
        console.log(`Files indexed: ${filesToIndex.length}`);
        console.log(`Chunks: ${chunks.length}`);
        console.log(`Vectors: ${vectors.length}`);
        console.log('='.repeat(70) + '\n');

        await job.updateProgress(100);

        return {
          success: true,
          indexType: 'incremental',
          repoId,
          projectId,
          filesRemoved: changedFiles.removed.length,
          filesIndexed: filesToIndex.length,
          chunksCreated: chunks.length,
          vectorsStored: vectors.length,
          completedAt: new Date().toISOString()
        };

      } catch (error) {
        console.error('Incremental indexing failed:', error);
        throw error;
      }
    }
  }