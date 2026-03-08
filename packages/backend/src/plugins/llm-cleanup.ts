import { isLLMEnabled, callOllamaJson } from "../services/ollama.js";
import type { Plugin, PluginContext, PluginState } from "./types.js";

const DEFAULT_CLEANUP_PROMPT = `You are cleaning up extracted structured data. The JSON array below was extracted from a web page in multiple passes and may contain duplicates, near-duplicates, or malformed entries.

Tasks:
1. Remove exact and near-duplicate entries (same key fields, e.g. same date + teams, or same date + title).
2. Add a "_quality" field to each remaining entry:
   - "ok"      = complete, plausible entry with real values
   - "partial" = real entry but some fields are missing, vague, or "TBA"
   - "invalid" = clearly malformed or a parsing artifact (e.g. a field contains "Unknown", looks like a count like "1 Games", or is nav/UI text rather than real data)
3. Do NOT remove entries — keep all of them but tag them accurately.
4. Normalize obviously inconsistent date or time formats where you can do so with confidence.

Return ONLY a valid JSON object in this exact shape (no markdown, no explanation):
{ "{key}": [ ...deduplicated entries each with a "_quality" field... ] }

Array to clean ({count} items):
{data}`;

/** Find the largest array in state.data to use as the cleanup target */
function findTargetKey(data: Record<string, unknown>): string | null {
	const skip = new Set(["promptUsed", "chunksProcessed", "_cleanupApplied", "_originalCount", "_cleanedCount"]);
	let best: string | null = null;
	let bestLen = 0;
	for (const [k, v] of Object.entries(data)) {
		if (skip.has(k) || k.startsWith("_")) continue;
		if (Array.isArray(v) && v.length > bestLen) {
			best = k;
			bestLen = v.length;
		}
	}
	return best;
}

export const llmCleanup: Plugin = {
	name: "llm-cleanup",
	defaultOrder: 300,

	// Opt-in only — enable via plugin_config for specific URL patterns
	shouldRunByDefault(_ctx: PluginContext): boolean {
		return false;
	},

	async run(_ctx: PluginContext, state: PluginState, config?: Record<string, unknown>): Promise<void> {
		if (!isLLMEnabled()) return;

		const targetKey = (config?.targetKey as string | undefined) ?? findTargetKey(state.data);
		if (!targetKey) return;

		const arr = state.data[targetKey];
		if (!Array.isArray(arr) || arr.length === 0) return;

		const tag = config?.tag !== false; // default true
		const debug = !!(config?.debug);
		const maxChars = (config?.maxChars as number | undefined) ?? 16000;
		const promptTemplate = (config?.prompt as string | undefined) ?? DEFAULT_CLEANUP_PROMPT;

		const dataJson = JSON.stringify(arr, null, 2);
		const truncated = dataJson.slice(0, maxChars);

		const prompt = promptTemplate
			.replace("{key}", targetKey)
			.replace("{count}", String(arr.length))
			.replace("{data}", truncated);

		try {
			const result = await callOllamaJson(prompt, { operation: "cleanup", url: _ctx.url, pluginName: "llm-cleanup" });
			const cleaned = result[targetKey];

			if (!Array.isArray(cleaned)) {
				if (debug) state.debugLog = { error: "LLM did not return an array for key: " + targetKey, rawResult: result };
				return;
			}

			state.data[targetKey] = tag
				? cleaned
				: cleaned.map((item: Record<string, unknown>) => { const { _quality, ...rest } = item; return rest; });

			state.data._cleanupApplied = true;
			state.data._originalCount = arr.length;
			state.data._cleanedCount = cleaned.length;

			if (debug) {
				const breakdown: Record<string, number> = {};
				for (const item of cleaned as Record<string, unknown>[]) {
					const q = (item._quality as string) ?? "untagged";
					breakdown[q] = (breakdown[q] ?? 0) + 1;
				}
				state.debugLog = {
					targetKey,
					originalCount: arr.length,
					cleanedCount: cleaned.length,
					qualityBreakdown: breakdown,
				};
			}
		} catch (e) {
			if (debug) state.debugLog = { error: String(e), targetKey };
			throw e;
		}
	},
};
