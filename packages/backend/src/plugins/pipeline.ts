import { db, schema } from "../db/client.js";
import type { Plugin, PluginContext, PluginState, PluginRunResult } from "./types.js";
import { findPluginConfig } from "./config.js";

const registry: Plugin[] = [];

const globalDebug = () => process.env.IMPACT_PLUGIN_DEBUG === "1";

export function registerPlugin(plugin: Plugin): void {
	registry.push(plugin);
	registry.sort((a, b) => a.defaultOrder - b.defaultOrder);
}

export async function runPipeline(ctx: PluginContext): Promise<PluginState> {
	const state: PluginState = {
		structuredContent: null,
		data: { ...ctx.extensionData },
		pluginResults: [],
	};

	for (const plugin of registry) {
		const cfg = findPluginConfig(plugin.name, ctx.url);
		const enabled = cfg ? cfg.enabled : plugin.shouldRunByDefault(ctx);
		if (!enabled) continue;

		const pluginConfig = cfg?.config;
		const debug = globalDebug() || (cfg?.debug ?? false);
		const start = performance.now();
		const result: PluginRunResult = {
			pluginName: plugin.name,
			durationMs: 0,
			input: debug ? { ctx: { url: ctx.url, domain: ctx.domain, hasHtml: !!ctx.pageHtml, hasText: !!ctx.pageText }, config: pluginConfig } : null,
			output: null,
			error: null,
		};

		try {
			await plugin.run(ctx, state, pluginConfig);
		} catch (e) {
			result.error = String(e);
			// Non-fatal: continue pipeline
		}

		if (debug) {
			result.output = {
				structuredContent: state.structuredContent?.slice(0, 2000),
				dataKeys: Object.keys(state.data),
				...state.debugLog,
			};
			state.debugLog = undefined;
		}

		result.durationMs = Math.round(performance.now() - start);
		state.pluginResults.push(result);
	}

	return state;
}

export function flushPluginLogs(
	snapshotId: number,
	url: string,
	results: PluginRunResult[],
): void {
	const now = Date.now();
	for (const r of results) {
		db.insert(schema.pluginLogs)
			.values({
				snapshotId,
				pluginName: r.pluginName,
				url,
				durationMs: r.durationMs,
				inputData: r.input ? JSON.stringify(r.input) : null,
				outputData: r.output ? JSON.stringify(r.output) : null,
				error: r.error,
				createdAt: now,
			})
			.run();
	}
}
