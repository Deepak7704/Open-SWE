import { GoogleGenerativeAI } from '@google/generative-ai';
import type { CodeChunk } from './chunking.service';

interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
}

export class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private readonly EMBEDDING_DIMENSION = 768;
  private readonly BATCH_SIZE = 10;

  constructor() {
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY!
    );
    this.model = this.genAI.getGenerativeModel({
      model: 'text-embedding-004'
    });
  }

  async generateEmbeddings(chunks: CodeChunk[]): Promise<number[][]> {
    console.log(`Generating embeddings for ${chunks.length} chunks`);
    console.log(`Model: text-embedding-004 (${this.EMBEDDING_DIMENSION} dimensions)\n`);

    const embeddings: number[][] = [];
    const totalBatches = Math.ceil(chunks.length / this.BATCH_SIZE);

    for (let i = 0; i < chunks.length; i += this.BATCH_SIZE) {
      const batch = chunks.slice(i, i + this.BATCH_SIZE);
      const batchNumber = Math.floor(i / this.BATCH_SIZE) + 1;

      console.log(`Processing batch ${batchNumber}/${totalBatches}`);

      const batchEmbeddings = await Promise.all(
        batch.map(chunk => this.embedChunk(chunk))
      );

      embeddings.push(...batchEmbeddings);

      if (i + this.BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Generated ${embeddings.length} embeddings\n`);
    return embeddings;
  }

  async generateSingleEmbedding(text: string): Promise<number[]> {
    const result = await this.model.embedContent(text);
    return result.embedding.values;
  }

  private async embedChunk(chunk: CodeChunk): Promise<number[]> {
    try {
      const text = this.formatChunkForEmbedding(chunk);
      const result = await this.model.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error(`Failed to embed ${chunk.id}`);
      return new Array(this.EMBEDDING_DIMENSION).fill(0);
    }
  }

  private formatChunkForEmbedding(chunk: CodeChunk): string {
    return `
File: ${chunk.filePath}
Type: ${chunk.fileType}
Function: ${chunk.functionName || 'N/A'}
Lines: ${chunk.lineStart}-${chunk.lineEnd}

${chunk.content}
    `.trim();
  }
}
