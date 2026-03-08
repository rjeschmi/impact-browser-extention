import { db, schema } from "../db/client.js";
import { eq } from "drizzle-orm";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5-coder:3b";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "embeddinggemma";

export function getOllamaModel(): string {
  const stored = db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "ollama_model")).get();
  return stored?.value ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
}

export function isLLMEnabled(): boolean {
  return process.env.IMPACT_LLM === "1";
}

// Free-form text generation (chat, Q&A)
export async function callOllama(prompt: string): Promise<string> {
  const model = getOllamaModel();
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.3, num_predict: 4096, num_ctx: 16384 } }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "no body");
    console.error(`[ollama] HTTP ${res.status}: ${body}`);
    throw new Error(`Ollama HTTP ${res.status}: ${body}`);
  }
  return ((await res.json()) as { response: string }).response;
}

// Structured JSON extraction — uses Ollama's JSON mode for reliable output
export async function callOllamaJson(prompt: string): Promise<Record<string, unknown>> {
  const model = getOllamaModel();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.1, num_predict: 4096, num_ctx: 16384 },
      }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "no body");
      console.error(`[ollama] HTTP ${res.status}: ${body}`);
      if (attempt === 2) throw new Error(`Ollama HTTP ${res.status}: ${body}`);
      continue;
    }
    const raw = ((await res.json()) as { response: string }).response.trim();

    // Try direct parse first (format:json should always produce this)
    try { return JSON.parse(raw) as Record<string, unknown>; } catch {}

    // Fallback: find the outermost JSON object
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]) as Record<string, unknown>; } catch {}
    }

    if (attempt === 2) throw new Error(`LLM did not return valid JSON after 2 attempts. Raw: ${raw.slice(0, 200)}`);
    // Second attempt: nudge the model with an explicit reminder
  }
  throw new Error("unreachable");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, input: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings[0];
}
