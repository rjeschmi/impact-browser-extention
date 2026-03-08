import { db, schema } from "../db/client.js";
import { eq } from "drizzle-orm";
import { recordLlmStat } from "./llm-stats.js";
import type { LlmCallMeta } from "./llm-stats.js";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5-coder:3b";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "embeddinggemma";

interface OllamaGenerateResponse {
	response: string;
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	eval_count?: number;
	eval_duration?: number;
	done?: boolean;
}

export function getOllamaModel(): string {
	const stored = db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "ollama_model")).get();
	return stored?.value ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
}

export function isLLMEnabled(): boolean {
	return process.env.IMPACT_LLM === "1";
}

// Free-form text generation (chat, Q&A)
export async function callOllama(prompt: string, meta: LlmCallMeta = {}): Promise<string> {
	const model = getOllamaModel();
	const wallStart = Date.now();
	const res = await fetch(`${OLLAMA_URL}/api/generate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.3, num_predict: 4096, num_ctx: 16384 } }),
		signal: AbortSignal.timeout(300_000),
	});
	const wallDurationMs = Date.now() - wallStart;
	if (!res.ok) {
		const body = await res.text().catch(() => "no body");
		console.error(`[ollama] HTTP ${res.status}: ${body}`);
		recordLlmStat(
			{ model, promptChars: prompt.length, responseChars: 0, wallDurationMs, attempt: 1, success: false, error: `HTTP ${res.status}` },
			{ ...meta, operation: meta.operation ?? "generate" },
		);
		throw new Error(`Ollama HTTP ${res.status}: ${body}`);
	}
	const data = await res.json() as OllamaGenerateResponse;
	recordLlmStat(
		{
			model,
			promptChars: prompt.length,
			responseChars: data.response.length,
			promptTokens: data.prompt_eval_count,
			completionTokens: data.eval_count,
			totalDurationMs: data.total_duration != null ? Math.round(data.total_duration / 1e6) : undefined,
			evalDurationMs: data.eval_duration != null ? Math.round(data.eval_duration / 1e6) : undefined,
			wallDurationMs,
			attempt: 1,
			success: true,
		},
		{ ...meta, operation: meta.operation ?? "generate" },
	);
	return data.response;
}

// Structured JSON extraction — uses Ollama's JSON mode for reliable output
export async function callOllamaJson(prompt: string, meta: LlmCallMeta = {}): Promise<Record<string, unknown>> {
	const model = getOllamaModel();
	const operation = meta.operation ?? "extraction";
	for (let attempt = 1; attempt <= 2; attempt++) {
		const wallStart = Date.now();
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
		const wallDurationMs = Date.now() - wallStart;
		if (!res.ok) {
			const body = await res.text().catch(() => "no body");
			console.error(`[ollama] HTTP ${res.status}: ${body}`);
			recordLlmStat(
				{ model, promptChars: prompt.length, responseChars: 0, wallDurationMs, attempt, success: false, error: `HTTP ${res.status}` },
				{ ...meta, operation },
			);
			if (attempt === 2) throw new Error(`Ollama HTTP ${res.status}: ${body}`);
			continue;
		}
		const data = await res.json() as OllamaGenerateResponse;
		const raw = data.response.trim();
		const baseStat = {
			model,
			promptChars: prompt.length,
			responseChars: raw.length,
			promptTokens: data.prompt_eval_count,
			completionTokens: data.eval_count,
			totalDurationMs: data.total_duration != null ? Math.round(data.total_duration / 1e6) : undefined,
			evalDurationMs: data.eval_duration != null ? Math.round(data.eval_duration / 1e6) : undefined,
			wallDurationMs,
			attempt,
		};

		// Try direct parse first (format:json should always produce this)
		try {
			const result = JSON.parse(raw) as Record<string, unknown>;
			recordLlmStat({ ...baseStat, success: true }, { ...meta, operation });
			return result;
		} catch {}

		// Fallback: find the outermost JSON object
		const match = raw.match(/\{[\s\S]*\}/);
		if (match) {
			try {
				const result = JSON.parse(match[0]) as Record<string, unknown>;
				recordLlmStat({ ...baseStat, success: true }, { ...meta, operation });
				return result;
			} catch {}
		}

		recordLlmStat({ ...baseStat, success: false, error: "JSON parse failed" }, { ...meta, operation });
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
