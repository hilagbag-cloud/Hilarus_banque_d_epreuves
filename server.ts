import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import http from "http";

const app = express();
const PORT = 3000;

app.use(express.json());

// Set up helper to fetch from external EducMaster APIs safely with correct Headers
const EDU_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const EDU_REFERER = "https://secondaire.educmaster.bj/epreuve/recherche";

// 1. Proxy API for searching exams
app.get("/api/search", async (req, res) => {
  try {
    const { classe_id, discipline_id, limit, search } = req.query;
    
    // Construct target URL
    const url = new URL("https://secondaire.educmaster.bj/api/epreuve/search");
    
    if (classe_id) url.searchParams.append("classe_id", String(classe_id));
    if (discipline_id) url.searchParams.append("discipline_id", String(discipline_id));
    if (limit) url.searchParams.append("limit", String(limit));
    if (search) url.searchParams.append("search", String(search));
    
    console.log(`[PROXY] Fetching search from: ${url.toString()}`);
    
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": EDU_USER_AGENT,
        "Referer": EDU_REFERER,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`EducMaster API search returned status ${response.status}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error("[PROXY ERROR] Failed to search:", error.message);
    return res.status(500).json({ 
      error: "Impossible de récupérer les épreuves", 
      details: error.message 
    });
  }
});

// 2. Proxy API for downloading an individual file
app.get("/api/file", async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "Le paramètre 'id' est requis (nom_epreuve)" });
    }

    const targetUrl = `https://secondaire.educmaster.bj/api/image/epreuve?id=${encodeURIComponent(String(id))}`;
    console.log(`[PROXY] Fetching file from: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": EDU_USER_AGENT,
        "Referer": EDU_REFERER,
      },
    });

    if (!response.ok) {
      throw new Error(`EducMaster API download returned status ${response.status}`);
    }

    // Extract actual file extension from content-disposition header if available, otherwise guess by content-type
    const actualContentDisposition = response.headers.get("content-disposition");
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    
    let extension = "pdf"; // default fallback for secondary.educmaster.bj
    if (actualContentDisposition) {
      const match = actualContentDisposition.match(/filename="?([^"]+)"?/i);
      if (match && match[1].includes(".")) {
        extension = match[1].split(".").pop() || "pdf";
      }
    } else if (contentType === "application/pdf") {
      extension = "pdf";
    } else if (contentType.includes("word") || contentType.includes("officedocument") || contentType.includes("msword")) {
      extension = "docx";
    }

    // Set headers
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${id}.${extension}"`);

    // Get arrayBuffer and send as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return res.send(buffer);
  } catch (error: any) {
    console.error("[PROXY ERROR] Failed to download file:", error.message);
    return res.status(500).json({ 
      error: "Impossible de télécharger le fichier", 
      details: error.message 
    });
  }
});

// A standard metadata health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date() });
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Ready! running on http://localhost:${PORT}`);
  });
}

startServer();
