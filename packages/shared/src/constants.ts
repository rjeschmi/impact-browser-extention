export const BACKEND_PORT = 7890;
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

export const REGISTRY_PORT = 7891;
export const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;

export const API_ROUTES = {
	health: "/api/health",
	visits: "/api/visits",
	visitsDomainSummary: "/api/visits/domain-summary",
	visitsStats: "/api/visits/stats",
	extractions: "/api/extractions",
	suggestions: "/api/suggestions",
	reminders: "/api/reminders",
	snapshots: "/api/snapshots",
	promptConfigs: "/api/prompt-configs",
	pluginConfigs: "/api/plugin-configs",
	pluginLogs: "/api/plugin-logs",
	registry: "/api/registry",
} as const;
