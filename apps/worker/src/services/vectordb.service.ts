import { Pinecone } from '@pinecone-database/pinecone';

interface PineconeVector {
  id: string;
  values: number[];
  metadata: Record<string, any>;
}

export class VectorDBService {
  private pinecone: Pinecone | null = null;
  private index: any = null;
  private readonly INDEX_NAME = 'openswe-code-index';
  private namespace: string = 'code-chunks'; // Will be set per repository
  private readonly HOST_URL = process.env.PINECONE_HOST;

  /**
   * Set the namespace for this repository
   * This ensures vectors are isolated per repository
   */
  setNamespace(repoId: string): void {
    // Convert repoId (e.g., "owner/repo") to valid namespace format
    // Pinecone namespaces must be alphanumeric + hyphens/underscores
    this.namespace = `repo-${repoId.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }

  async initialize(repoId?: string): Promise<void> {
    console.log('Initializing Pinecone...');
    console.log(`Host: ${this.HOST_URL}`);

    if (!this.HOST_URL) {
      throw new Error('PINECONE_HOST environment variable is not set');
    }

    // Set namespace if repoId is provided
    if (repoId) {
      this.setNamespace(repoId);
    }

    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!
    });

    this.index = this.pinecone.Index(this.INDEX_NAME, this.HOST_URL);

    console.log('Pinecone initialized\n');
  }

  async upsertVectors(vectors: PineconeVector[]): Promise<void> {
    if (!this.index) {
      throw new Error('VectorDB not initialized');
    }

    console.log(`Upserting ${vectors.length} vectors to Pinecone...`);
    console.log(`Namespace: ${this.namespace}\n`);

    const BATCH_SIZE = 100;

    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(vectors.length / BATCH_SIZE);

      console.log(`Batch ${batchNumber}/${totalBatches}`);

      await this.index.namespace(this.namespace).upsert(batch);

      if (i + BATCH_SIZE < vectors.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Stored ${vectors.length} vectors in Pinecone (namespace: ${this.namespace})\n`);
  }

  async queryVectors(
    queryVector: number[],
    topK: number = 20
  ): Promise<Array<{ id: string; score: number; metadata: Record<string, any> }>> {
    if (!this.index) {
      throw new Error('VectorDB not initialized');
    }

    console.log(`Querying Pinecone namespace: ${this.namespace}`);

    const results = await this.index.namespace(this.namespace).query({
      vector: queryVector,
      topK: topK,
      includeMetadata: true
    });

    return results.matches.map((match: any) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata
    }));
  }

  async deleteNamespace(): Promise<void> {
    if (!this.index) {
      throw new Error('VectorDB not initialized');
    }

    console.log(`Deleting namespace: ${this.namespace}`);
    await this.index.namespace(this.namespace).deleteAll();
    console.log('Namespace cleared\n');
  }
}
