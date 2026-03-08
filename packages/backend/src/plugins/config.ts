import { db, schema } from "../db/client.js";
import { eq } from "drizzle-orm";

/** Convert a glob-style pattern (using * as wildcard) to a regex */
export function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*");
	return new RegExp(`^${escaped}$`);
}

export interface ResolvedPluginConfig {
	enabled: boolean;
	config: Record<string, unknown>;
	debug: boolean;
}

/** Find the best matching plugin config for a URL + plugin name */
export function findPluginConfig(
	pluginName: string,
	url: string,
): ResolvedPluginConfig | null {
	const rows = db
		.select()
		.from(schema.pluginConfigs)
		.where(eq(schema.pluginConfigs.pluginName, pluginName))
		.all();

	if (rows.length === 0) return null;

	// Sort by priority desc, then pattern length desc (most specific wins)
	rows.sort(
		(a, b) =>
			b.priority - a.priority ||
			b.urlPattern.length - a.urlPattern.length,
	);

	for (const row of rows) {
		if (globToRegex(row.urlPattern).test(url)) {
			const parsed = row.config ? (JSON.parse(row.config) as Record<string, unknown>) : {};
			return {
				enabled: row.enabled,
				config: parsed,
				debug: parsed.debug === true,
			};
		}
	}

	return null;
}
