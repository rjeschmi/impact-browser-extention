export const BACKEND_PORT = 7890;
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

export const API_ROUTES = {
	health: "/api/health",
	visits: "/api/visits",
	visitsStats: "/api/visits/stats",
	extractions: "/api/extractions",
	suggestions: "/api/suggestions",
	reminders: "/api/reminders",
} as const;
