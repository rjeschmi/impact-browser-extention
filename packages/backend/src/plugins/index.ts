import { registerPlugin } from "./pipeline.js";
import { cheerioPreprocessor } from "./cheerio-preprocessor.js";
import { rssExtractor } from "./rss-extractor.js";
import { llmExtraction } from "./llm-extraction.js";
import { llmCleanup } from "./llm-cleanup.js";

registerPlugin(rssExtractor);
registerPlugin(cheerioPreprocessor);
registerPlugin(llmExtraction);
registerPlugin(llmCleanup);

export { runPipeline, flushPluginLogs } from "./pipeline.js";
export type { PluginContext, PluginState, PluginRunResult, Plugin } from "./types.js";
