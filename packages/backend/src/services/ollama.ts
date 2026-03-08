const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "embeddinggemma";

export function isLLMEnabled(): boolean {
  return process.env.IMPACT_LLM === "1";
}

// Free-form text generation (chat, Q&A)
export async function callOllama(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.3, num_predict: 1024 } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  return ((await res.json()) as { response: string }).response;
}

// Structured JSON extraction — uses Ollama's JSON mode for reliable output
export async function callOllamaJson(prompt: string): Promise<Record<string, unknown>> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.1, num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
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
