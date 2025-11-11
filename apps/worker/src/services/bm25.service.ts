import type { CodeChunk } from './chunking.service';
import { Redis } from 'ioredis';

interface BM25Document {
  id: string;
  filePath: string;
  fileName: string;
  functionName: string | null;
  tokens: string[];
  content: string;
}

interface BM25Result {
  documentId: string;
  score: number;
  rank: number;
  metadata: BM25Document;
}

interface BM25Index {
  documents: Record<string, BM25Document>;
  invertedIndex: Record<string, string[]>;
  tokenFrequency: Record<string, Record<string, number>>;
  documentFrequency: Record<string, number>;
  avgDocLength: number;
  metadata: {
    timestamp: string;
    totalDocuments: number;
    uniqueTokens: number;
    repoId: string;
  };
}

export class BM25Service {
  private redis: Redis;
  private repoId: string;
  private documents: Map<string, BM25Document> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private tokenFrequency: Map<string, Map<string, number>> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private avgDocLength: number = 0;

  private readonly K1 = 1.5;
  private readonly B = 0.75;
  private readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been'
  ]);

  constructor(redis: Redis, repoId: string) {
    this.redis = redis;
    this.repoId = repoId;
  }

  async buildIndex(chunks: CodeChunk[]): Promise<void> {
    console.log(`Building BM25 index for ${chunks.length} documents\n`);

    const documents = chunks.map(chunk => ({
      id: chunk.id,
      filePath: chunk.filePath,
      fileName: chunk.fileName,
      functionName: chunk.functionName,
      tokens: this.tokenize(chunk.content),
      content: chunk.content
    }));

    for (const doc of documents) {
      this.documents.set(doc.id, doc);

      for (const token of doc.tokens) {
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, new Set());
        }
        this.invertedIndex.get(token)!.add(doc.id);

        if (!this.tokenFrequency.has(doc.id)) {
          this.tokenFrequency.set(doc.id, new Map());
        }
        const freq = this.tokenFrequency.get(doc.id)!;
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }

    for (const [token, docIds] of this.invertedIndex) {
      this.documentFrequency.set(token, docIds.size);
    }

    const totalLength = Array.from(this.documents.values())
      .reduce((sum, doc) => sum + doc.tokens.length, 0);
    this.avgDocLength = totalLength / this.documents.size;

    console.log(`Index Statistics:`);
    console.log(`Total documents: ${this.documents.size}`);
    console.log(`Unique tokens: ${this.invertedIndex.size}`);
    console.log(`Average document length: ${this.avgDocLength.toFixed(1)} tokens\n`);

    await this.saveToRedis();
  }

  private async saveToRedis(): Promise<void> {
    console.log(`Saving BM25 index to Redis...`);

    const index: BM25Index = {
      documents: Object.fromEntries(this.documents),
      invertedIndex: Object.fromEntries(
        Array.from(this.invertedIndex.entries()).map(([token, docIds]) => [
          token,
          Array.from(docIds)
        ])
      ),
      tokenFrequency: Object.fromEntries(
        Array.from(this.tokenFrequency.entries()).map(([docId, freqMap]) => [
          docId,
          Object.fromEntries(freqMap)
        ])
      ),
      documentFrequency: Object.fromEntries(this.documentFrequency),
      avgDocLength: this.avgDocLength,
      metadata: {
        timestamp: new Date().toISOString(),
        totalDocuments: this.documents.size,
        uniqueTokens: this.invertedIndex.size,
        repoId: this.repoId
      }
    };

    const key = `bm25:index:${this.repoId}`;
    await this.redis.set(key, JSON.stringify(index));
    console.log(`✓ BM25 index saved to Redis at key: ${key}`);
    console.log(`  Storage: ${(JSON.stringify(index).length / 1024).toFixed(2)} KB\n`);
  }

  async loadFromRedis(): Promise<boolean> {
    console.log(`Loading BM25 index from Redis...`);

    const key = `bm25:index:${this.repoId}`;
    const data = await this.redis.get(key);

    if (!data) {
      console.log(`✗ No BM25 index found in Redis for repo: ${this.repoId}`);
      console.log(`  Need to build index from scratch\n`);
      return false;
    }

    const index: BM25Index = JSON.parse(data);

    this.documents = new Map(Object.entries(index.documents));
    this.invertedIndex = new Map(
      Object.entries(index.invertedIndex).map(([token, docIds]) => [
        token,
        new Set(docIds)
      ])
    );
    this.tokenFrequency = new Map(
      Object.entries(index.tokenFrequency).map(([docId, freqObj]) => [
        docId,
        new Map(Object.entries(freqObj))
      ])
    );
    this.documentFrequency = new Map(
      Object.entries(index.documentFrequency).map(([token, count]) => [
        token,
        count as number
      ])
    );
    this.avgDocLength = index.avgDocLength;

    console.log(`✓ BM25 index loaded from Redis`);
    console.log(`  Total documents: ${this.documents.size}`);
    console.log(`  Unique tokens: ${this.invertedIndex.size}`);
    console.log(`  Index created: ${index.metadata.timestamp}\n`);

    return true;
  }

  search(query: string, topK: number = 30): BM25Result[] {
    console.log(`BM25 Search: "${query}"\n`);

    const queryTokens = this.tokenize(query);
    console.log(`Query tokens: ${queryTokens.join(', ')}\n`);

    const scores = new Map<string, number>();

    for (const token of queryTokens) {
      const docIds = this.invertedIndex.get(token) || new Set();
      const idf = Math.log(
        (this.documents.size - docIds.size + 0.5) / (docIds.size + 0.5) + 1
      );

      for (const docId of docIds) {
        const doc = this.documents.get(docId)!;
        const freq = this.tokenFrequency.get(docId)?.get(token) || 0;

        const bm25Score =
          (idf * freq * (this.K1 + 1)) /
          (freq + this.K1 * (1 - this.B + this.B * (doc.tokens.length / this.avgDocLength)));

        scores.set(docId, (scores.get(docId) || 0) + bm25Score);
      }
    }

    const results: BM25Result[] = Array.from(scores.entries())
      .map(([docId, score]) => ({
        documentId: docId,
        score: score,
        rank: 0,
        metadata: this.documents.get(docId)!
      }))
      .sort((a, b) => b.score - a.score);

    results.forEach((result, idx) => {
      result.rank = idx + 1;
    });

    const topResults = results.slice(0, topK);
    console.log(`Found ${results.length} matches, returning top ${topResults.length}`);
    topResults.slice(0, 5).forEach(result => {
      console.log(`${result.rank}. ${result.metadata.filePath} (score: ${result.score.toFixed(2)})`);
    });
    console.log('');

    return topResults;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1 && !this.STOP_WORDS.has(token));
  }

  async removeFile(filePath: string): Promise<void> {
    try {
      const loaded = await this.loadFromRedis();
      if (!loaded) {
        console.log(`No index to remove from`);
        return;
      }

      const docIdsToRemove: string[] = [];
      for (const [docId, doc] of this.documents) {
        if (doc.filePath === filePath) {
          docIdsToRemove.push(docId);
        }
      }

      if (docIdsToRemove.length === 0) {
        console.log(`BM25: No documents found for ${filePath}`);
        return;
      }

      for (const docId of docIdsToRemove) {
        const doc = this.documents.get(docId)!;
        this.documents.delete(docId);

        for (const token of doc.tokens) {
          const docSet = this.invertedIndex.get(token);
          if (docSet) {
            docSet.delete(docId);
            if (docSet.size === 0) {
              this.invertedIndex.delete(token);
            }
          }
        }

        this.tokenFrequency.delete(docId);
      }

      this.documentFrequency.clear();
      for (const [token, docIds] of this.invertedIndex) {
        this.documentFrequency.set(token, docIds.size);
      }

      if (this.documents.size > 0) {
        const totalLength = Array.from(this.documents.values())
          .reduce((sum, doc) => sum + doc.tokens.length, 0);
        this.avgDocLength = totalLength / this.documents.size;
      } else {
        this.avgDocLength = 0;
      }

      await this.saveToRedis();

      console.log(`BM25: Removed ${docIdsToRemove.length} chunks for ${filePath}`);
    } catch (error: any) {
      console.error(`BM25: Failed to remove ${filePath}:`, error.message);
      throw error;
    }
  }

  async updateFiles(chunks: CodeChunk[]): Promise<void> {
    try {
      const loaded = await this.loadFromRedis();
      if (!loaded) {
        await this.buildIndex(chunks);
        return;
      }

      const fileChunks = new Map<string, CodeChunk[]>();
      for (const chunk of chunks) {
        if (!fileChunks.has(chunk.filePath)) {
          fileChunks.set(chunk.filePath, []);
        }
        fileChunks.get(chunk.filePath)!.push(chunk);
      }

      for (const [filePath, chunks] of fileChunks) {
        await this.removeFileFromMemory(filePath);
        await this.addFileChunks(filePath, chunks);
        console.log(`BM25: Updated ${chunks.length} chunks for ${filePath}`);
      }

      await this.saveToRedis();
    } catch (error: any) {
      console.error(`BM25: Failed to update files:`, error.message);
      throw error;
    }
  }

  private async removeFileFromMemory(filePath: string): Promise<void> {
    const docIdsToRemove: string[] = [];
    for (const [docId, doc] of this.documents) {
      if (doc.filePath === filePath) {
        docIdsToRemove.push(docId);
      }
    }

    for (const docId of docIdsToRemove) {
      const doc = this.documents.get(docId)!;
      this.documents.delete(docId);

      for (const token of doc.tokens) {
        const docSet = this.invertedIndex.get(token);
        if (docSet) {
          docSet.delete(docId);
          if (docSet.size === 0) {
            this.invertedIndex.delete(token);
          }
        }
      }

      this.tokenFrequency.delete(docId);
    }

    this.documentFrequency.clear();
    for (const [token, docIds] of this.invertedIndex) {
      this.documentFrequency.set(token, docIds.size);
    }

    if (this.documents.size > 0) {
      const totalLength = Array.from(this.documents.values())
        .reduce((sum, doc) => sum + doc.tokens.length, 0);
      this.avgDocLength = totalLength / this.documents.size;
    } else {
      this.avgDocLength = 0;
    }
  }

  private async addFileChunks(filePath: string, chunks: CodeChunk[]): Promise<void> {
    const documents = chunks.map(chunk => ({
      id: chunk.id,
      filePath: chunk.filePath,
      fileName: chunk.fileName,
      functionName: chunk.functionName,
      tokens: this.tokenize(chunk.content),
      content: chunk.content
    }));

    for (const doc of documents) {
      this.documents.set(doc.id, doc);

      for (const token of doc.tokens) {
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, new Set());
        }
        this.invertedIndex.get(token)!.add(doc.id);

        if (!this.tokenFrequency.has(doc.id)) {
          this.tokenFrequency.set(doc.id, new Map());
        }
        const freq = this.tokenFrequency.get(doc.id)!;
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }

    this.documentFrequency.clear();
    for (const [token, docIds] of this.invertedIndex) {
      this.documentFrequency.set(token, docIds.size);
    }

    const totalLength = Array.from(this.documents.values())
      .reduce((sum, doc) => sum + doc.tokens.length, 0);
    this.avgDocLength = totalLength / this.documents.size;
  }
}
