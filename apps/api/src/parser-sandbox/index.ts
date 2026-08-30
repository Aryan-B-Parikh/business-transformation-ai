import express from "express";
import mammoth from "mammoth";
import multer from "multer";
import os from "os";
// @ts-expect-error
import pdfParse from "pdf-parse";

const app = express();
const upload = multer({ 
  dest: os.tmpdir(), 
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB limit
  } 
});

app.post("/parse", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const { originalname, path: filePath, mimetype } = req.file;

  try {
    let content = "";
    if (originalname.endsWith(".pdf") || mimetype === "application/pdf") {
      const data = await pdfParse(filePath);
      content = data.text;
    } else if (originalname.endsWith(".docx") || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ path: filePath });
      content = result.value;
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // Return the parsed content
    res.json({ content });
  } catch (error) {
    console.error("Parser Error:", error);
    res.status(500).json({ error: "Failed to parse document" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Sandbox parser listening on port ${PORT}`);
});
