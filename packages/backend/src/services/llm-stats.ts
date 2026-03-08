import { db, schema } from "../db/client.js";

export interface LlmCallMeta {
	operation?: string;
	url?: string;
	pluginName?: string;
}

export interface LlmCallStats {
	model: string;
	promptChars: number;
	responseChars: number;
	promptTokens?: number;
	completionTokens?: number;
	totalDurationMs?: number;
	evalDurationMs?: number;
	wallDurationMs: number;
	attempt: number;
	success: boolean;
	error?: string;
}

export function recordLlmStat(stats: LlmCallStats, meta: LlmCallMeta = {}): void {
	try {
		db.insert(schema.llmStats).values({
			model: stats.model,
			operation: meta.operation ?? "unknown",
			url: meta.url ?? null,
			pluginName: meta.pluginName ?? null,
			promptChars: stats.promptChars,
			responseChars: stats.responseChars,
			promptTokens: stats.promptTokens ?? null,
			completionTokens: stats.completionTokens ?? null,
			totalDurationMs: stats.totalDurationMs ?? null,
			evalDurationMs: stats.evalDurationMs ?? null,
			wallDurationMs: stats.wallDurationMs,
			attempt: stats.attempt,
			success: stats.success,
			error: stats.error ?? null,
			createdAt: Date.now(),
		}).run();
	} catch {
		// Non-fatal — never let stats logging break the main flow
	}
}
