import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";
import multer from "multer";
import { ingestDocument, queryAI } from "../controllers/aiController";

const router = express.Router();

const uploadsDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// Inline the storage configuration straight into multer to force compliance
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const randomHash = crypto.randomBytes(16).toString("hex");

      // 1. Grab the original extension if it exists
      let extension = path.extname(file.originalname).toLowerCase();

      // 2. FALLBACK MECHANISM: If PowerShell mangled the filename and stripped the extension,
      // deduce the true extension from the network Mime Type header!
      if (!extension) {
        console.log(
          `⚠️ originalname lost extension. Checking mimetype: ${file.mimetype}`,
        );
        switch (file.mimetype) {
          case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            extension = ".xlsx";
            break;
          case "application/vnd.ms-excel":
            extension = ".xls";
            break;
          case "application/pdf":
            extension = ".pdf";
            break;
          case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            extension = ".docx";
            break;
          case "application/msword":
            extension = ".doc";
            break;
          case "image/png":
            extension = ".png";
            break;
          case "image/jpeg":
            extension = ".jpg";
            break;
          default:
            extension = ""; // Leave blank if unknown
        }
      }

      console.log(`✨ Multer is saving file as: ${randomHash}${extension}`);
      cb(null, `${randomHash}${extension}`);
    },
  }),
});

router.post("/ingest", upload.single("doc"), ingestDocument);
router.post("/query", queryAI);

export default router;
