export interface PluginContext {
	url: string;
	domain: string;
	pageHtml: string | null;
	pageText: string | null;
	extensionData: Record<string, unknown>;
}

export interface PluginState {
	structuredContent: string | null;
	data: Record<string, unknown>;
	pluginResults: PluginRunResult[];
	debugLog?: Record<string, unknown>;
}

export interface PluginRunResult {
	pluginName: string;
	durationMs: number;
	input: unknown;
	output: unknown;
	error: string | null;
}

export interface Plugin {
	name: string;
	defaultOrder: number;
	shouldRunByDefault(ctx: PluginContext): boolean;
	run(
		ctx: PluginContext,
		state: PluginState,
		config?: Record<string, unknown>,
	): Promise<void>;
}
