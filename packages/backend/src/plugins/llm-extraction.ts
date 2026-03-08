import { isLLMEnabled, callOllamaJson } from "../services/ollama.js";
import type { Plugin, PluginContext, PluginState } from "./types.js";

export const DEFAULT_EXTRACTION_PROMPT = `Extract key information from this web page as a JSON object.

URL: {url}
Content:
{pageText}

Return a compact JSON object. Always include a "summary" field (2-3 sentences describing the page). For product pages include: name, price, currency, availability. For articles include: title, author, date, key_points (array). For any other page, include whatever fields best capture the important information.

Return ONLY valid JSON with no markdown, no preamble, no explanation.`;

/** Collapse whitespace, drop short nav lines */
export function cleanPageText(raw: string, maxChars = 32000): string {
	return raw
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 5)
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.slice(0, maxChars);
}

/** Deep-merge two extracted JSON results. Arrays are concatenated; strings keep the longer value. */
function mergeResults(base: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
	const out = { ...base };
	for (const [key, val] of Object.entries(next)) {
		if (!(key in out)) {
			out[key] = val;
		} else if (Array.isArray(out[key]) && Array.isArray(val)) {
			out[key] = [...(out[key] as unknown[]), ...val];
		} else if (typeof val === "string" && typeof out[key] === "string") {
			out[key] = (val as string).length > (out[key] as string).length ? val : out[key];
		}
		// for numbers / booleans: keep base value
	}
	return out;
}

export const llmExtraction: Plugin = {
	name: "llm-extraction",
	defaultOrder: 200,

	shouldRunByDefault(ctx: PluginContext): boolean {
		return isLLMEnabled() && !!(ctx.pageText || ctx.pageHtml);
	},

	async run(ctx: PluginContext, state: PluginState, config?: Record<string, unknown>): Promise<void> {
		if (!isLLMEnabled()) return;

		// Prefer structured content from Cheerio, fall back to raw page text
		const content = state.structuredContent ?? ctx.pageText;
		if (!content) return;

		const chunkSize = (config?.chunkSize as number) ?? 6000;
		const chunkOverlap = Math.round(chunkSize * 0.1);
		const slidingWindow = !!(config?.slidingWindow) && content.length > chunkSize;

		const cleanedContent = state.structuredContent
			? content
			: cleanPageText(content, chunkSize);

		const promptTemplate = (config?.prompt as string) ?? DEFAULT_EXTRACTION_PROMPT;

		const debug = !!(config?.debug);

		if (!slidingWindow) {
			const truncated = cleanedContent.slice(0, chunkSize);
			const prompt = promptTemplate.replace("{url}", ctx.url).replace("{pageText}", truncated);
			try {
				const extracted = await callOllamaJson(prompt, { operation: "extraction", url: ctx.url, pluginName: "llm-extraction" });
				Object.assign(state.data, extracted);
				state.data.promptUsed = promptTemplate;
				if (debug) {
					state.debugLog = {
						contentLength: cleanedContent.length,
						promptSent: prompt,
						rawResult: extracted,
					};
				}
			} catch (e) {
				if (debug) {
					state.debugLog = {
						contentLength: cleanedContent.length,
						promptSent: prompt,
						error: String(e),
					};
				}
				throw e;
			}
			return;
		}

		// Sliding window: split into chunks, run LLM on each, merge results
		const chunks: string[] = [];
		let pos = 0;
		while (pos < cleanedContent.length) {
			chunks.push(cleanedContent.slice(pos, pos + chunkSize));
			if (pos + chunkSize >= cleanedContent.length) break;
			pos += chunkSize - chunkOverlap;
		}

		let merged: Record<string, unknown> = {};
		const chunkLogs: { prompt: string; result: unknown; error?: string }[] = [];
		for (let i = 0; i < chunks.length; i++) {
			const chunkPrompt = promptTemplate
				.replace("{url}", ctx.url)
				.replace("{pageText}", `[Part ${i + 1}/${chunks.length}]\n${chunks[i]}`);
			try {
				const result = await callOllamaJson(chunkPrompt, { operation: "extraction", url: ctx.url, pluginName: "llm-extraction" });
				merged = mergeResults(merged, result);
				if (debug) chunkLogs.push({ prompt: chunkPrompt, result });
			} catch (e) {
				if (debug) chunkLogs.push({ prompt: chunkPrompt, result: null, error: String(e) });
			}
		}

		Object.assign(state.data, merged);
		state.data.promptUsed = promptTemplate;
		state.data.chunksProcessed = chunks.length;
		if (debug) {
			state.debugLog = {
				contentLength: cleanedContent.length,
				chunks: chunkLogs,
				mergedResult: merged,
			};
		}
	},
};
