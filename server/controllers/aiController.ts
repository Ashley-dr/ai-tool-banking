import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import type { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import DocumentChunk from "../models/DocumentChunk";
import sequelize from "../config/database";
import type {
  DocumentChunkRow,
  OllamaEmbeddingResponse,
  OllamaGenerateResponse,
  ParserResult,
} from "../types/ai";

const PARSER_SCRIPT = path.join(process.cwd(), "parser.py");
const PYTHON_EXECUTABLE = process.platform === "win32" ? "python" : "python3";

const OLLAMA_EMBEDDINGS_URL =
  process.env.OLLAMA_EMBEDDINGS_URL || "http://localhost:11434/api/embeddings";
const OLLAMA_GENERATE_URL =
  process.env.OLLAMA_GENERATE_URL || "http://localhost:11434/api/generate";
function formatVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export const ingestDocument = (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: "Missing physical file payload." });
    return;
  }

  const filePath = path.resolve(req.file.path);
  const python = spawn(PYTHON_EXECUTABLE, [PARSER_SCRIPT, filePath]);
  let pythonBufferOutput = "";
  let pythonErrorOutput = "";

  python.stdout.on("data", (data: Buffer) => {
    pythonBufferOutput += data.toString();
  });

  python.stderr.on("data", (data: Buffer) => {
    pythonErrorOutput += data.toString();
  });

  python.on("error", (err) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res
      .status(500)
      .json({ error: `Failed to start Python worker: ${err.message}` });
  });

  python.on("close", async (code: number | null) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (code !== 0) {
      const detail = pythonErrorOutput.trim() || pythonBufferOutput.trim();
      res.status(500).json({
        error: "Local Python worker thread failed processing.",
        ...(detail && { detail }),
      });
      return;
    }

    try {
      const result = JSON.parse(pythonBufferOutput) as ParserResult;
      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      try {
        for (const item of result.data) {
          await DocumentChunk.create({
            content: item.content,
            embedding: formatVector(item.embedding),
          });
        }
      } catch (dbError: any) {
        res.status(500).json({
          error: "Failed to write raw vectors to PostgreSQL pool.",
          detail: dbError.message,
        });
        return;
      }

      res.json({
        message:
          "Document processed and text layers securely indexed in database!",
      });
    } catch {
      res.status(500).json({
        error: "Failed to read structured array properties from parser.",
      });
    }
  });
};

export const queryAI = async (req: Request, res: Response): Promise<void> => {
  const { question } = req.body as { question?: string };
  if (!question) {
    res.status(400).json({ error: "Missing query question string." });
    return;
  }

  try {
    if (!OLLAMA_EMBEDDINGS_URL || !OLLAMA_GENERATE_URL) {
      res.status(500).json({ error: "Missing Model endpoint configuration." });
      return;
    }

    // Dynamic payload configuration matching based on your active .env URL configuration routing
    const isNewEndpoint = OLLAMA_EMBEDDINGS_URL.endsWith("/api/embed");
    const payloadBody = isNewEndpoint
      ? { model: "nomic-embed-text", input: question }
      : { model: "nomic-embed-text", prompt: question };

    const vectorRes = await fetch(OLLAMA_EMBEDDINGS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadBody), 
    });

    if (!vectorRes.ok) {
      throw new Error(`Ollama embeddings returned status code ${vectorRes.status}`);
    }

    const rawOllamaData = await vectorRes.json() as any;
    let embedding: number[] | undefined;

    // Direct Extraction Layout Matrix Parsing
    if (rawOllamaData && Array.isArray(rawOllamaData.embeddings) && rawOllamaData.embeddings.length > 0) {
      embedding = rawOllamaData.embeddings[0];
    } else if (rawOllamaData && Array.isArray(rawOllamaData.embedding) && rawOllamaData.embedding.length > 0) {
      embedding = rawOllamaData.embedding;
    }

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      console.error("❌ Unexpected Ollama Payload Layout Structure:", rawOllamaData);
      throw new Error("Ollama answered but failed to yield a populated vector matrix row array.");
    }

    const closestMatches = await sequelize.query<DocumentChunkRow>(
      `
        SELECT content FROM document_chunks
        ORDER BY embedding::vector <=> :questionVector::vector LIMIT 12;
      `,
      {
        replacements: { questionVector: formatVector(embedding) },
        type: QueryTypes.SELECT,
      },
    );

    const documentationContext = closestMatches
      .map((match) => match.content)
      .join("\n\n");

    const promptInstructions = `[OCR REPAIR ENGINE ACTIVE]\nYou are analyzing an official corporate document snippet that contains text character artifacts due to page scan blur. Deduce the meaning based on context (e.g. "Biring" means "Hiring", "Fosation" means "Position").\n\nCONTEXT:\n${documentationContext}\n\nQUESTION:\n${question}`;

    const aiResponse = await fetch(OLLAMA_GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1:8b",
        prompt: promptInstructions,
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`Ollama generation returned status code ${aiResponse.status}`);
    }

    const aiData = (await aiResponse.json()) as OllamaGenerateResponse;
    res.json({ answer: aiData.response });
  } catch (err: any) {
    console.error("⚠️ Ollama Pipeline Crash Error:", err);
    res.status(500).json({
      error: "AI network container connection timed out or failed.",
      detail: err.message,
    });
  }
};
