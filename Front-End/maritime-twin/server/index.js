import express from "express";
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = "AIzaSyDP2VI3hkv0Hr0qatscSdb734mFsogbg0Q";
const PORT = process.env.GEMINI_PORT ? Number(process.env.GEMINI_PORT) : 8787;

const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/api/gemini", async (req, res) => {
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  try {
    const interaction = await client.interactions.create({
      model: "gemini-2.5-flash",
      input: prompt,
    });

    const outputs = interaction.outputs || [];
    const lastOutput = outputs[outputs.length - 1];
    const text = lastOutput?.text || "";

    if (!text.trim()) {
      return res
        .status(502)
        .json({ error: "Gemini returned an empty response." });
    }

    return res.json({ answer: text.trim() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gemini request failed.";
    return res.status(502).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Gemini server listening on http://localhost:${PORT}`);
});
