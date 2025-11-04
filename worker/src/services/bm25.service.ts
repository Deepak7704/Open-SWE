import type { CodeChunk } from './chunking.service';
import { Redis } from "ioredis";

interface BM25Document {
  id: string;         // Unique identifier: "chunk-1","chunk-2"..
  filePath: string;
  fileName: string;
  functionName: string | null;
  tokens: string[];
  content: string;
}

interface BM25Result {    //useful when getting results for related chunk
  documentId: string; // chunk1,chunk2 ..
  score: number;// BM25 score: 8.5 (higher = more relevant)
  rank: number; // Position in results: 1, 2, 3...
  metadata: BM25Document; //full document data
}

interface BM25Index{
  documents: Record<string,BM25Document>;
  invertedIndex: Record<string,string[]>;//"pagination"->[c1,c2]
  tokenFrequency : Record<string,Record<string,number>>;  // Example: chunk-1 -> { "const": 3, "blogs": 2, "useState": 1 }

  documentFrequency : Record<string,number>;
  // Example: "pagination" -> 3 (appears in 3 documents)
  avgDocLength : number;
  metadata:{
    timestamp:string;
    totalDocuments:number;
    uniqueTokens : number;
    repoId : string;
  };

}

export class BM25Service {

  private redis : Redis;
  private repoId : string;

  // All documents indexed
  // Key: "chunk-1", Value: { id, filePath, tokens, content, ... }
  private documents: Map<string, BM25Document> = new Map();


  // Inverted index: word -> set of document IDs containing it
  // Example: "pagination" -> Set("chunk-1", "chunk-3", "chunk-5")
  private invertedIndex: Map<string, Set<string>> = new Map();

  // Term frequency matrix: docId -> { token -> count }
  // Example: "chunk-1" -> { "const": 3, "blogs": 2 }
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

    // Save to Redis for persistence (no TTL - permanent storage)
    await this.saveToRedis();
  }

  // Save BM25 inverted index to Redis for persistence
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
    console.log(` BM25 index saved to Redis at key: ${key}`);
    console.log(`   Storage: ${(JSON.stringify(index).length / 1024).toFixed(2)} KB\n`);
  }

  // Load BM25 inverted index from Redis (avoids rebuilding)
  async loadFromRedis(): Promise<boolean> {
    console.log(`Loading BM25 index from Redis...`);

    const key = `bm25:index:${this.repoId}`;
    const data = await this.redis.get(key);

    if (!data) {
      console.log(` No BM25 index found in Redis for repo: ${this.repoId}`);
      console.log(`   Need to build index from scratch\n`);
      return false;
    }

    const index: BM25Index = JSON.parse(data);

    // Restore in-memory data structures from Redis
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

    console.log(` BM25 index loaded from Redis`);
    console.log(`   Total documents: ${this.documents.size}`);
    console.log(`   Unique tokens: ${this.invertedIndex.size}`);
    console.log(`   Index created: ${index.metadata.timestamp}\n`);

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
}
