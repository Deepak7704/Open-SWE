import Redis from 'ioredis';
import { BM25Service } from './bm25.service';
import { VectorDBService } from './vectordb.service';
import { EmbeddingService } from './embedding.service';

/**
 * Hybrid Search Service
 *
 * Combines BM25 (keyword-based) and Vector (semantic) search
 * to find the most relevant code chunks for a query.
 *
 * Uses Reciprocal Rank Fusion (RRF) algorithm to merge results.
 */

interface SearchResult {
  chunkId: string;
  filePath: string;
  fileName: string;
  functionName: string | null;
  content: string;
  score: number;
  rank: number;
  sources: {
    bm25Score?: number;
    bm25Rank?: number;
    vectorScore?: number;
    vectorRank?: number;
  };
}

export class HybridSearchService {
  private redis: Redis;
  private repoId: string;
  private bm25Service: BM25Service;
  private vectorDBService: VectorDBService;
  private embeddingService: EmbeddingService;

  // RRF constant (typical value: 60)
  private readonly RRF_K = 60;

  // Weights for combining scores (if using weighted average instead of RRF)
  private readonly BM25_WEIGHT = 0.4;
  private readonly VECTOR_WEIGHT = 0.6;

  constructor(redis: Redis, repoId: string) {
    this.redis = redis;
    this.repoId = repoId;
    this.bm25Service = new BM25Service(redis, repoId);
    this.vectorDBService = new VectorDBService();
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Initialize services (load BM25 from Redis, initialize VectorDB)
   */
  async initialize(): Promise<void> {
    console.log('\n' + '='.repeat(70));
    console.log('HYBRID SEARCH INITIALIZATION');
    console.log('='.repeat(70) + '\n');

    // Load BM25 index from Redis
    const bm25Loaded = await this.bm25Service.loadFromRedis();
    if (!bm25Loaded) {
      console.warn('⚠️  BM25 index not found. Hybrid search will use vector-only mode.\n');
    }

    // Initialize Pinecone
    await this.vectorDBService.initialize();

    console.log('✅ Hybrid search initialized\n');
  }

  /**
   * Search using both BM25 and Vector similarity
   * Returns combined results using Reciprocal Rank Fusion
   */
  async search(
    query: string,
    topK: number = 20,
    method: 'rrf' | 'weighted' = 'rrf'
  ): Promise<SearchResult[]> {
    console.log('\n' + '='.repeat(70));
    console.log('HYBRID SEARCH QUERY');
    console.log('='.repeat(70));
    console.log(`Query: "${query}"`);
    console.log(`Top K: ${topK}`);
    console.log(`Fusion Method: ${method.toUpperCase()}`);
    console.log('='.repeat(70) + '\n');

    // Step 1: BM25 Search (keyword-based)
    console.log('STEP 1: BM25 Search (Keyword-based)\n');
    const bm25Results = this.bm25Service.search(query, topK * 2); // Get more for better fusion
    console.log(`BM25 returned ${bm25Results.length} results\n`);

    // Step 2: Vector Search (semantic)
    console.log('STEP 2: Vector Search (Semantic)\n');
    const queryEmbedding = await this.embeddingService.generateSingleEmbedding(query);
    console.log(`Generated query embedding (${queryEmbedding.length} dimensions)`);

    const vectorResults = await this.vectorDBService.queryVectors(queryEmbedding, topK * 2);
    console.log(`Vector search returned ${vectorResults.length} results\n`);

    // Step 3: Fusion
    console.log('STEP 3: Combining Results\n');
    let fusedResults: SearchResult[];

    if (method === 'rrf') {
      fusedResults = this.reciprocalRankFusion(bm25Results, vectorResults);
    } else {
      fusedResults = this.weightedFusion(bm25Results, vectorResults);
    }

    // Return top K
    const finalResults = fusedResults.slice(0, topK);

    console.log('='.repeat(70));
    console.log('HYBRID SEARCH RESULTS');
    console.log('='.repeat(70));
    console.log(`Total unique results: ${fusedResults.length}`);
    console.log(`Returning top ${finalResults.length}\n`);

    // Display top 10 results
    finalResults.slice(0, 10).forEach((result, idx) => {
      console.log(`${idx + 1}. ${result.filePath}`);
      console.log(`   Score: ${result.score.toFixed(4)} | BM25: ${result.sources.bm25Score?.toFixed(2) || 'N/A'} | Vector: ${result.sources.vectorScore?.toFixed(2) || 'N/A'}`);
      if (result.functionName) {
        console.log(`   Function: ${result.functionName}`);
      }
      console.log('');
    });

    return finalResults;
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   *
   * Formula: score(d) = sum( 1 / (k + rank(d)) )
   *
   * More robust than weighted average for combining rankings.
   * Handles cases where one system returns no results gracefully.
   */
  private reciprocalRankFusion(
    bm25Results: Array<{ documentId: string; score: number; rank: number; metadata: any }>,
    vectorResults: Array<{ id: string; score: number; metadata: any }>
  ): SearchResult[] {
    console.log('Using Reciprocal Rank Fusion (RRF)\n');

    // Create lookup maps
    const bm25Map = new Map(
      bm25Results.map((r, idx) => [r.documentId, { ...r, rank: idx + 1 }])
    );
    const vectorMap = new Map(
      vectorResults.map((r, idx) => [r.id, { ...r, rank: idx + 1 }])
    );

    // Get all unique chunk IDs
    const allChunkIds = new Set([
      ...bm25Results.map(r => r.documentId),
      ...vectorResults.map(r => r.id)
    ]);

    // Calculate RRF score for each chunk
    const scoredResults: SearchResult[] = [];

    for (const chunkId of allChunkIds) {
      const bm25Result = bm25Map.get(chunkId);
      const vectorResult = vectorMap.get(chunkId);

      // RRF formula: 1 / (k + rank)
      const bm25RRF = bm25Result ? 1 / (this.RRF_K + bm25Result.rank) : 0;
      const vectorRRF = vectorResult ? 1 / (this.RRF_K + vectorResult.rank) : 0;

      const totalScore = bm25RRF + vectorRRF;

      // Use metadata from whichever source has it (prefer vector for more complete metadata)
      const metadata = vectorResult?.metadata || bm25Result?.metadata;

      scoredResults.push({
        chunkId,
        filePath: metadata?.filePath || 'unknown',
        fileName: metadata?.fileName || 'unknown',
        functionName: metadata?.functionName || null,
        content: metadata?.content || bm25Result?.metadata?.content || '',
        score: totalScore,
        rank: 0, // Will be set after sorting
        sources: {
          bm25Score: bm25Result?.score,
          bm25Rank: bm25Result?.rank,
          vectorScore: vectorResult?.score,
          vectorRank: vectorResult?.rank
        }
      });
    }

    // Sort by RRF score (descending)
    scoredResults.sort((a, b) => b.score - a.score);

    // Assign final ranks
    scoredResults.forEach((result, idx) => {
      result.rank = idx + 1;
    });

    return scoredResults;
  }

  /**
   * Weighted Average Fusion
   *
   * Combines normalized scores using predefined weights.
   * Simple but requires score normalization.
   */
  private weightedFusion(
    bm25Results: Array<{ documentId: string; score: number; rank: number; metadata: any }>,
    vectorResults: Array<{ id: string; score: number; metadata: any }>
  ): SearchResult[] {
    console.log('Using Weighted Average Fusion\n');
    console.log(`BM25 Weight: ${this.BM25_WEIGHT}`);
    console.log(`Vector Weight: ${this.VECTOR_WEIGHT}\n`);

    // Normalize BM25 scores (0-1 range)
    const maxBM25 = Math.max(...bm25Results.map(r => r.score), 1);
    const normalizedBM25 = new Map(
      bm25Results.map(r => [
        r.documentId,
        { ...r, normalizedScore: r.score / maxBM25 }
      ])
    );

    // Vector scores are already 0-1 (cosine similarity)
    const vectorMap = new Map(
      vectorResults.map(r => [r.id, r])
    );

    // Get all unique chunk IDs
    const allChunkIds = new Set([
      ...bm25Results.map(r => r.documentId),
      ...vectorResults.map(r => r.id)
    ]);

    // Calculate weighted score for each chunk
    const scoredResults: SearchResult[] = [];

    for (const chunkId of allChunkIds) {
      const bm25Result = normalizedBM25.get(chunkId);
      const vectorResult = vectorMap.get(chunkId);

      const bm25Score = bm25Result ? bm25Result.normalizedScore * this.BM25_WEIGHT : 0;
      const vectorScore = vectorResult ? vectorResult.score * this.VECTOR_WEIGHT : 0;

      const totalScore = bm25Score + vectorScore;

      const metadata = vectorResult?.metadata || bm25Result?.metadata;

      scoredResults.push({
        chunkId,
        filePath: metadata?.filePath || 'unknown',
        fileName: metadata?.fileName || 'unknown',
        functionName: metadata?.functionName || null,
        content: metadata?.content || bm25Result?.metadata?.content || '',
        score: totalScore,
        rank: 0,
        sources: {
          bm25Score: bm25Result?.score,
          bm25Rank: bm25Result?.rank,
          vectorScore: vectorResult?.score,
          vectorRank: vectorResults.findIndex(r => r.id === chunkId) + 1
        }
      });
    }

    // Sort by weighted score (descending)
    scoredResults.sort((a, b) => b.score - a.score);

    // Assign final ranks
    scoredResults.forEach((result, idx) => {
      result.rank = idx + 1;
    });

    return scoredResults;
  }

  /**
   * Get unique file paths from search results
   * Useful for selecting which files to modify
   */
  getUniqueFiles(results: SearchResult[]): string[] {
    const filePaths = new Set(results.map(r => r.filePath));
    return Array.from(filePaths);
  }

  /**
   * Group results by file for easier analysis
   */
  groupByFile(results: SearchResult[]): Map<string, SearchResult[]> {
    const grouped = new Map<string, SearchResult[]>();

    for (const result of results) {
      const existing = grouped.get(result.filePath) || [];
      existing.push(result);
      grouped.set(result.filePath, existing);
    }

    return grouped;
  }
}
