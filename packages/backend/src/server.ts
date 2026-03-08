import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { join, dirname } from "node:path";
import visits from "./api/visits.js";
import extractions from "./api/extractions.js";
import suggestions from "./api/suggestions.js";
import reminders from "./api/reminders.js";
import settings from "./api/settings.js";
import snapshots from "./api/snapshots.js";
import promptConfigs from "./api/prompt-configs.js";
import pluginConfigs from "./api/plugin-configs.js";
import pluginLogs from "./api/plugin-logs.js";
import registry from "./api/registry.js";
import "./plugins/index.js";

const DASHBOARD_DIR = join(dirname(import.meta.dir), "..", "dashboard", "dist");

const app = new Hono();

app.use("*", logger());
app.use(
	"*",
	cors({
		origin: ["http://localhost:7890", "chrome-extension://*"],
		allowMethods: ["GET", "POST", "PATCH", "DELETE"],
		allowHeaders: ["Content-Type"],
	}),
);

app.get("/api/health", (c) => {
	return c.json({ status: "ok", timestamp: Date.now() });
});

app.route("/api/visits", visits);
app.route("/api/extractions", extractions);
app.route("/api/suggestions", suggestions);
app.route("/api/reminders", reminders);
app.route("/api/settings", settings);
app.route("/api/snapshots", snapshots);
app.route("/api/prompt-configs", promptConfigs);
app.route("/api/plugin-configs", pluginConfigs);
app.route("/api/plugin-logs", pluginLogs);
app.route("/api/registry", registry);

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
};

// Serve dashboard static files
app.get("/*", async (c) => {
	const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
	const filePath = join(DASHBOARD_DIR, reqPath);
	const file = Bun.file(filePath);
	const ext = reqPath.slice(reqPath.lastIndexOf("."));
	const contentType = MIME[ext] ?? "application/octet-stream";

	if (await file.exists()) {
		return new Response(file, { headers: { "Content-Type": contentType } });
	}
	// SPA fallback
	return new Response(Bun.file(join(DASHBOARD_DIR, "index.html")), {
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
});

export default app;
