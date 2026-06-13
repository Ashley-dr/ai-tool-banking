export interface ParserChunk {
  content: string;
  embedding: number[];
}

export interface ParserSuccessResult {
  success: true;
  data: ParserChunk[];
}

export interface ParserErrorResult {
  success: false;
  error: string;
}

export type ParserResult = ParserSuccessResult | ParserErrorResult;

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

export interface OllamaGenerateResponse {
  response: string;
}

export interface DocumentChunkRow {
  content: string;
}
