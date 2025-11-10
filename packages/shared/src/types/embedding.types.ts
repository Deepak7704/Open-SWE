export interface CodeChunk{
    id : string;
    filePath : string;
    fileName : string;
    fileType : string;
    functionName : string | null;
    lineStart : number;
    lineEnd : number;
    content : string;
    chunkType : 'function' | 'class' | 'lines';
}

export interface VectorRecord{
    id : string;
    values : number[];
    metadata : VectorMetadata;
}

export interface VectorMetadata{
    repoId : string;
    repoUrl : string;
    filePath : string;
    fileName : string;
    fileType : string;
    functionName : string | null;
    lineStart : number;
    lineEnd : number;
    content : string;
    chunkType : string;
}

export interface IndexingResult{
    repoId : string;
    totalFiles : number;
    totalChunks : number;
    indexedAt : Date;
}
