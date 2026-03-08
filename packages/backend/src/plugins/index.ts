import { registerPlugin } from "./pipeline.js";
import { cheerioPreprocessor } from "./cheerio-preprocessor.js";
import { llmExtraction } from "./llm-extraction.js";

registerPlugin(cheerioPreprocessor);
registerPlugin(llmExtraction);

export { runPipeline, flushPluginLogs } from "./pipeline.js";
export type { PluginContext, PluginState, PluginRunResult, Plugin } from "./types.js";
