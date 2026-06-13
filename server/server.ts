import express from "express";
import sequelize from "./config/database";
import DocumentChunk from "./models/DocumentChunk";
import aiRoute from "./routes/aiRoute";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use("/api", aiRoute);

async function ensurePgVector(): Promise<void> {
  await sequelize.query("CREATE EXTENSION IF NOT EXISTS vector");
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      embedding vector(768) NOT NULL
    )
  `);
}

async function bootServer(): Promise<void> {
  try {
    await sequelize.authenticate();
    await ensurePgVector();
    await DocumentChunk.sync();

    console.log("📊 Database schemas synchronized flawlessly.");

    app.listen(PORT, () => {
      console.log(
        `🔒 Secure Banking AI Pipeline actively listening on http://localhost:${PORT}`,
      );
    });
  } catch (error) {
    console.error("❌ Failed to initialize application backend:", error);
    process.exit(1);
  }
}

bootServer();
